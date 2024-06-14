const { MongoClient, ServerApiVersion } = require('mongodb');

let mongodb_client;

async function run(client) {
    try {
      await client.connect();
      console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
      //await client.close();
    }
};  

async function insertUser(userId, newUser, client) {
    try {
        const updateResult = await client.db('JChat').collection('users').updateOne(
            { _id: userId.toString() }, 
            { $push: { usersList: newUser[0] } },
            { upsert: true }   
        );
        
        if (updateResult.matchedCount === 0) {
            return null
        } else if (updateResult.modifiedCount === 1) {
            return updateResult
        }
    } catch (error) {
        console.error("Error updating user:", error);
    }
}

async function getUserList(userId, client) {
    try {
        const result = await client.db('JChat').collection('users').findOne({_id: userId.toString()});
        if (result) {
            return result; 
        } else {
            return null; 
        }
    } catch (error) {
        console.error("Error fetching user:", error);
        return null; 
    }
}

module.exports = { run, insertUser, getUserList };