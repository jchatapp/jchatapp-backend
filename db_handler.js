const { MongoClient, ServerApiVersion } = require('mongodb');

function getCurrentTimestampMicro() {
    const date = new Date();
    const timestampMicro = date.getTime() * 1000;
    return timestampMicro.toString();
  }

async function run(client) {
    try {
      await client.connect();
      console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
      //await client.close();
    }
};  

async function insertUser(userId, usersList, client) {
    try {
      const results = [];
      for (const user of usersList) {
        const newUserPk = user.pk_id;
        const timestamp = getCurrentTimestampMicro();
  
        const userWithTimestamp = {
          ...user,
          timestamp: timestamp, 
          seen: false
        };
  
        const updateResult = await client.db('JChat').collection('users').updateOne(
          {
            _id: userId.toString(),
            "usersList.pk_id": { $ne: newUserPk }
          },
          { $push: { usersList: userWithTimestamp } },
          { upsert: true }
        );
  
        results.push(updateResult);
      }
      return results;
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;  
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

async function deleteUser(userId, pk, client) {
    try {
      const result = await  client.db('JChat').collection('users').updateOne(
        { _id: userId.toString() },
        { $pull: { usersList: { pk: pk } } }
      );
  
      if (result.matchedCount === 0) {
            return null; 
        } else if (result.modifiedCount === 1) {
            return result;  
        }
    } catch (e) {
      console.error("An error occurred while deleting the user:", e);
    } 
}

module.exports = { run, insertUser, getUserList, deleteUser };