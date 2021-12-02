import fs from 'fs/promises'
import path from 'path'
import axios from 'axios'
import { isPointWithinRadius } from 'geolib'

const PATH = path.join(path.resolve(), '/stores.json')
const FILE = await fs.readFile(PATH)

// Array of stores
const stores = JSON.parse(FILE.toString())
// Array of stores sorted by their name. Ascending order.
const storesByName = [...stores].sort((a, b) => a.name < b.name ? -1 : 1)
// Array of stores sorted by their name. Ascending order. Includes coords property.
const storesWithCoords = await getStoresWithCoords([...storesByName])
// Array of stores sorted by their coords. North to South, then West to East.
const storesByCoords = [...storesWithCoords].sort(sortFromNorthToSouth)

export default class StoresController {
	/**
	 * Send array of stores.
	 * @param [req.query.coords] {boolean} If true, then include coords property in each store item.
	 */
	static async apiGetStores (req, res, next) {
		const result = req.query?.coords === 'true' ? storesWithCoords : stores
		return res.json(result)
	}

	/**
	 * Send one store by given name. Use binary search algorithm.
	 * @param req.params.name {string} Name of store to search.
	 * @param [req.query.coords] {boolean} If true, then include coords property.
	 */
	static async apiGetStore (req, res, next) {
		const { name } = req.params
		const includeCoords = req.query?.coords === 'true'

		if (!(name && name.length)) {
			return res.send('Missing name parameter!')
		}

		const searchResult = storesByName[binarySearch(name)]

		if (!includeCoords) return res.json(searchResult)

		if (!await validateStore(searchResult)) {
			const { name, postcode } = searchResult
			const message = `Given postcode ${postcode} of the store ${name} is invalid!`
			return res.send(message)
		}

		const storeWithCoords = await insertCoords(searchResult)
		return res.json(storeWithCoords)

		/**
		 * Returns search result as index number.
		 * @param name {string} Name of store
		 * @returns {number} Index of storesByName
		 */
		function binarySearch (name) {
			let start = 0
			let end = storesByName.length - 1
			let mid = Math.floor((start + end) / 2)
			while (name !== storesByName[mid].name) {
				if (name < storesByName[mid].name) {
					end = mid - 1
				} else {
					start = mid + 1
				}
				mid = Math.floor((start + end) / 2)
			}
			return mid
		}
	}

	/**
	 * @param req.query.postcode {string}
	 * @param req.query.radius {number} Metric
	 */
	static async apiGetSearch (req, res, next) {
		const { postcode: targetPostcode, radius } = req.query

		if (!radius) {
			const message = `Radius must be a positive integer!`
			return res.send(message)
		}

		if (!await validatePostcode(targetPostcode)) {
			const message = `Given postcode ${targetPostcode} is invalid!`
			return res.send(message)
		}

		const { latitude, longitude } = await getCoords(targetPostcode)
		return res.json(searchWithinRadius(latitude, longitude, radius))

		/**
		 * Returns array of stores within given radius from given coords.
		 * @param latitude {number}
		 * @param longitude {number}
		 * @param radius {number} Unit is in meter
		 * @return {object[]} Returns stores
		 */
		function searchWithinRadius (latitude, longitude, radius) {
			return storesByCoords.filter(store => {
				return isPointWithinRadius(
					{
						latitude: store.coords.latitude,
						longitude: store.coords.longitude
					},
					{ latitude, longitude }, radius)
			})
		}
	}
}

async function validateStore (store) {
	//Given postcode GU19 5DG of Bagshot is invalid!
	return validatePostcode(store['postcode'])
}

async function validatePostcode (postcode) {
	const { data } = await axios.get(
		`https://api.postcodes.io/postcodes/${postcode}/validate`)
	return data['result']
}

async function insertCoords (store) {
	// http://localhost:3000/stores/search?postcode=AL1%202RJ&radius=5
	const { latitude, longitude } = await getCoords(store['postcode'])
	return {
		...store, coords: { latitude, longitude }
	}
}

async function getCoords (postcode) {
	const { data } = await axios.get(
		`https://api.postcodes.io/postcodes/${postcode}`)

	const { latitude, longitude } = data.result
	return { latitude, longitude }
}

async function getStoresWithCoords (stores) {
	const promises = stores.map(async store => {
		try {
			await validateStore(store)
			return await insertCoords(store)
		} catch {
			return 'error'
		}
	})

	const promiseResult = await Promise.allSettled(promises)
	return [...promiseResult].filter(v => v.value !== 'error').
		map(v => v.value)
}

function sortFromNorthToSouth ({ coords: a }, { coords: b }) {
	return a.latitude !== b.latitude ? b.latitude -
		a.latitude : a.longitude - b.longitude
}