const express = require('express')
const cors = require('cors')

const mongoose = require('mongoose')
require('dotenv').config()
const Driver = require('./models/Driver')
const app = express()

app.use(cors())
app.use(express.json())

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected successfully')
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error)
  })
  app.get('/api/drivers', async (req, res) => {
  try {
    const drivers = await Driver.find()
    res.json(drivers)
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch drivers',
    })
  }
})
app.post('/api/drivers', async (req, res) => {
  try {
    const newDriver = new Driver(req.body)

    const savedDriver = await newDriver.save()

    res.status(201).json(savedDriver)
  } catch (error) {
    res.status(500).json({
      message: 'Failed to create driver',
    })
  }
})
app.put('/api/drivers/:id', async (req, res) => {
  try {
    const updatedDriver = await Driver.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )

    res.json(updatedDriver)
  } catch (error) {
    res.status(500).json({
      message: 'Failed to update driver',
    })
  }
})
app.delete('/api/drivers/:id', async (req, res) => {
  try {
    await Driver.findByIdAndDelete(req.params.id)

    res.json({
      message: 'Driver deleted successfully',
    })
  } catch (error) {
    res.status(500).json({
      message: 'Failed to delete driver',
    })
  }
})
app.get('/', (req, res) => {
  res.send('Smart Logistics System API is running')
})

const PORT = 5000

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})