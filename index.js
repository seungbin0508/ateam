import express from 'express'
import router from './routers/index.js'

const app = express()

app.use(router)

app.use((err, req, res, next) => {
	console.error(err)
	return res.json(err)
})

app.listen(3000, () => 'Serve Listening at PORT 3000')
