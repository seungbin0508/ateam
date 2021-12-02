import { Router } from 'express'
import StoresController from '../controllers/storesController.js'

const router = Router()

router.get('/stores/search', StoresController.apiGetSearch)
router.get('/stores', StoresController.apiGetStores)
router.get('/stores/:name', StoresController.apiGetStore)

export default router