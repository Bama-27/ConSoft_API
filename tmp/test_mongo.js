const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function testMongo() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/consoft';
  console.log('Connecting to:', uri);
  await mongoose.connect(uri);
  
  const Product = mongoose.model('Producto', new mongoose.Schema({}, { strict: false }));
  
  const one = await Product.findOne();
  if (one) {
    const fullId = one._id.toString();
    const shortId = fullId.slice(-6);
    console.log(`Full ID: ${fullId}, Short ID: ${shortId}`);
    
    const results = await Product.find({
      $expr: {
        $regexMatch: {
          input: { $toString: '$_id' },
          regex: shortId,
          options: 'i'
        }
      }
    });
    
    console.log('Results count for shortId:', results.length);
    if (results.length > 0) {
      console.log('First result _id:', results[0]._id.toString());
    }
    
    // Test case-insensitivity
    const shortIdUpper = shortId.toUpperCase();
    console.log(`Testing with Uppercase Short ID: ${shortIdUpper}`);
    const resultsUpper = await Product.find({
      $expr: {
        $regexMatch: {
          input: { $toString: '$_id' },
          regex: shortIdUpper,
          options: 'i'
        }
      }
    });
    console.log('Results count for uppercase shortId:', resultsUpper.length);

  } else {
    console.log('No products found to test with.');
  }
  
  await mongoose.disconnect();
}

testMongo().catch(console.error);
