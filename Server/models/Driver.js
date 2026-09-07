const mongoose = require('mongoose')

const driverSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  licence: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    default: 'Available',
  },
  image: {
    type: String,
    default: null,
  },
})

module.exports = mongoose.model('Driver', driverSchema)