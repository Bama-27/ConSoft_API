import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/consoft');
        const searchStr = 'alejandro'; // example
        const regex = new RegExp(searchStr, 'i');
        
        const UserModel = mongoose.model('User', new mongoose.Schema({ name: String }, { strict: false }));
        const userMatches = await UserModel.find({ name: regex }).select('_id');
        console.log('User matches:', userMatches);

        const VisitModel = mongoose.model('Visit', new mongoose.Schema({ user: mongoose.Schema.Types.ObjectId }, { strict: false }));
        const filter = {
            $or: [
                { user: { $in: userMatches.map(u => u._id) } }
            ]
        };
        const visits = await VisitModel.find(filter).populate('user', 'name');
        console.log('Visits found:', visits.length);
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
test();
