const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const inquirer = import('inquirer');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { IgApiClient, IgCheckpointError, IgLoginTwoFactorRequiredError } = require('instagram-private-api');
const host = '0.0.0.0'; 
let igClient = new IgApiClient();
let user;
let pass;
let userpk;
const { run, insertUser, getUserList, deleteUser, setLastSeenTimestamp} = require('./db_handler');
const app = express();
const port = 8000; 
require('dotenv').config();
const uri = process.env.MONGO_KEY;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

run(client)

app.use(bodyParser.json()); 
app.use(cors()); 

app.listen(port, () => {
  console.log(`Server running on http://${host}:${port}`);
});

app.get("/", (req, res) => {
  res.send("server is running");
})

async function login(username, password) {
  igClient.state.generateDevice(username);
  await igClient.simulate.preLoginFlow();
  try {
    const loggedInUser = await igClient.account.login(username, password);
    return loggedInUser;
  } catch (e) {
    console.error('Login failed:', e);
    throw e;
  }
}

async function handleTwoFactorAuth(ig, username, twoFactorInfo) {
  const { two_factor_identifier } = twoFactorInfo;
  const verificationMethod = twoFactorInfo.totp_two_factor_on ? '0' : '1';
  
  try {
    const { code } = await inquirer.prompt([{
      type: 'input',
      name: 'code',
      message: `Enter the 2FA code received via ${verificationMethod === '1' ? 'SMS' : 'TOTP'}:`
    }]);

    return await igClient.account.twoFactorLogin({
      username,
      verificationCode: code,
      twoFactorIdentifier: two_factor_identifier,
      verificationMethod,
      trustThisDevice: '1',
    });
  } catch (error) {
    console.error('Failed to complete two-factor authentication:', error);
    throw error;
  }
}

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  user = username;
  pass = password;

  try {
    const userData = await login(username, password);
    const chatList = await igClient.feed.directInbox().items();
    const userInfo = await igClient.user.info(userData.pk);
    userpk = userData.pk
    const userList = await getUserList(userpk, client)
    const userPostList = await getUserListData(userList)
    res.json({
      userData, 
      chatList, 
      userInfo,
      userList,
      userPostList
    });
  } catch (error) {
    console.error(error)
    if (isCheckpointError(error)) {
      try {
        console.log('Waiting 3 seconds before reinitializing igClient...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        igClient = new IgApiClient();
        console.log('Done waiting');
        await login(user, pass);
      } catch (checkpointError) {
        console.error('Failed to handle checkpoint error:', checkpointError);
        return res.status(500).json({ error: 'Failed to handle checkpoint error' });
      }
    }
    if (isTwoFactorError(error)) {
        const userData = await handleTwoFactorAuth(ig, username, error.response.body.two_factor_info);
        const chatList = await igClient.feed.directInbox().items();
        const userInfo = await igClient.user.info(userData.pk);
        res.json({
          userData, 
          chatList, 
          userInfo,
          usersList
        });
      }
    console.error('Login failed:', error); 
    if (error.name === "IgCheckpointError") {
      try {
        console.log('Handling checkpoint error...');
        await startCheckpoint();
        console.log('Checkpoint handled');
      } catch (checkpointError) {
        console.error('Failed to handle checkpoint error:', checkpointError);
        return res.status(500).json({ error: 'Failed to handle checkpoint error' });
      }
      res.status(400).json({ error: 'Challenge Required' }); 
    }
    else {
      res.status(400).json({ error: 'Invalid login credentials' }); 
    }
  }
});

app.post('/relogin', async (req, res) => {
  try {
    const userData = await igClient.account.login(user, pass); 
    const chatList = await igClient.feed.directInbox().items();
    res.json({
      userData, 
      chatList, 
    });
  } catch (error) {
    console.error('Re-login failed:', error); 
    res.status(400).json({ error: 'Failed to re-login' }); 
  }
});

app.get('/chats/:thread_id', async (req, res) => {
  const { thread_id } = req.params; 
  const thread = igClient.entity.directThread();
  try {
    const threadF = await igClient.feed.directThread(thread);
    threadF.cursor = undefined;
    threadF.id = thread_id;
    threadF.request().then((response) => {
      res.json(response.thread); 
      return response.thread;     
    }).catch((error) => {
      console.error("Error:", error); 
    });
  } catch (error) {
    console.error('Failed to fetch chat list:', error); 
    res.status(500).json({ error: 'Failed to retrieve chat list' }); 
  }
});

app.get('/chats/:thread_id/messages', async (req, res) => {
  const { thread_id } = req.params;
  const { cursor } = req.query;

  if (!thread_id) {
    return res.status(400).json({ error: 'Thread ID is required' });
  }

  try {
    const thread = igClient.feed.directThread({ thread_id: thread_id });
    thread.cursor = cursor;
    let messages = await thread.items();

    if (!thread.isMoreAvailable()) {
      messages = null
    }

    res.json({
      messages: messages,
      cursor: thread.cursor, 
    });
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

app.get('/chats/:thread_id/new_messages', async (req, res) => {
  const { thread_id } = req.params;
  const { last_timestamp } = req.query;

  if (!thread_id) {
    return res.status(400).json({ error: 'Thread ID is required' });
  }

  try {
    const thread = igClient.feed.directThread({ thread_id: thread_id });
    const messages = await thread.items(); 
    const filteredMessages = messages.filter(message => parseInt(message.timestamp, 10) > parseInt(last_timestamp, 10));

    res.json({
      messages: filteredMessages
    });
  } catch (error) {
    if (error.name === 'IgLoginRequiredError' || error.message.includes('401')) {
      try {
        await new Promise(resolve => setTimeout(resolve, 7000));
        igClient = new IgApiClient();
        await login(user, pass);
        const thread = igClient.feed.directThread({ thread_id: thread_id });
        const messages = await thread.items(); 
        const filteredMessages = messages.filter(message => parseInt(message.timestamp, 10) > parseInt(last_timestamp, 10));

        res.json({
          messages: filteredMessages
        });
      } catch (reloginError) {
        console.error('Re-login failed:', reloginError);
        res.status(500).json({ error: 'Failed to retrieve messages after re-login' });
      }
    } else {
      res.status(500).json({ error: 'Failed to retrieve messages' });
    }
  }
});

app.post('/chats/:thread_id/send_message', async (req, res) => {
  const { thread_id } = req.params;
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  try {
    const directThread = igClient.entity.directThread(thread_id);
    const response = await directThread.broadcastText(message);
    res.status(200).json({ message: 'Message sent successfully', response });
  } catch (error) {
    if (error.name === 'IgLoginRequiredError') {
      await new Promise(resolve => setTimeout(resolve, 7000));
        igClient = new IgApiClient();
        await login(user, pass);
        const directThread = igClient.entity.directThread(thread_id);
        const response = await directThread.broadcastText(message);
    }
    console.error('Failed to send message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.get('/chats', async (req, res) => {
  try {
    const chatList = await igClient.feed.directInbox().items();
    res.json(chatList);
  } catch (error) {
    if (isCheckpointError(error)) {
      try {
        console.log('Handling checkpoint error...');
        await igClient.challenge.auto(true);
        console.log('Checkpoint handled');
      } catch (checkpointError) {
        console.error('Failed to handle checkpoint error:', checkpointError);
        return res.status(500).json({ error: 'Failed to handle checkpoint error' });
      }
    } else if (error.name === 'IgLoginRequiredError' || error.message.includes('401')) {
      try {
        console.log('Waiting 3 seconds before reinitializing igClient...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        igClient = new IgApiClient();
        console.log('Done waiting');
        await login(user, pass);
        const chatList = await igClient.feed.directInbox().items();
        return res.json(chatList); 
      } catch (reloginError) {
        if (isCheckpointError(reloginError)) {
          try {
            console.log('Handling checkpoint error...');
            await startCheckpoint();
            console.log('Checkpoint handled');
          } catch (checkpointError) {
            console.error('Failed to handle checkpoint error:', checkpointError);
            return res.status(500).json({ error: 'Failed to handle checkpoint error' });
          }
        }
        console.error('Re-login failed:', reloginError);
        return res.status(500).json({ error: 'Failed to retrieve messages after re-login' });
      }
    } else {
      console.error('Failed to fetch chat list:', error);
      return res.status(500).json({ error: 'Failed to fetch chat list' });
    }
  }
});

app.post('/chats/:thread_id/seen', async (req, res) => {
  const { thread_id } = req.params;
  const { item_id } = req.body;

  if (!thread_id || !item_id) {
    return res.status(400).json({ error: 'Thread ID and item ID are required' });
  }

  try {
    const directThread = igClient.entity.directThread(thread_id);
    await directThread.markItemSeen(item_id);
    res.status(200).json({ message: 'Message marked as seen' });
  } catch (error) {
    console.error('Failed to mark message as seen:', error);
    res.status(500).json({ error: 'Failed to mark message as seen' });
  }
});

app.post('/logout', async (req, res) => {
  try {
    igClient.account.logout()
    res.status(200).json({ message: 'Logged out' });
    igClient = new IgApiClient();
  } catch (error) {
    console.error('Failed to logout:', error);
    res.status(500).json({ error: 'Failed to logout:' });
  }
});

app.post("/createchat", async (req, res) => {
  const { users, message } = req.body; 
  const userPKs = users.map(user => user.pk); 
  try {
    const directThread = igClient.entity.directThread(userPKs)
    directThread.broadcastText(message)
    await igClient.feed.directInbox().items();
    res.status(200).json({ thread: directThread });
  } catch (error) {
    console.error(error)
  }
})

app.get('/searchUser', async (req, res) => {
  const { username } = req.query;
  try {
    const user = await igClient.user.searchExact(username);
    res.status(200).json(user);
  } catch (error) {
    if (error.name === 'IgExactUserNotFoundError') {
      res.status(404).json({ error: 'No user found' });
    } else if (error.name === 'IgLoginRequiredError' || error.message.includes('401')) {
      try {
        console.log('Waiting 3 seconds before reinitializing igClient...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        igClient = new IgApiClient();
        console.log('Done waiting');
        await login(user, pass);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error });
      }
    } else {
      console.error('Failed to get user:', error);
      res.status(500).json({ error: 'Internal server error' });
    } 
  }
});

app.post("/delete", async (req, res) => {
  const { thread_id } = req.query;
  try {
    const thread = igClient.entity.directThread(thread_id);
    await thread.hide();
    res.sendStatus(200);
  } catch (error) {
    console.error('Failed to delete chat:', error);
    res.status(500).json({ error: 'Could not delete chat', details: error.message });
  }
});

app.post("/changeChatName", async (req, res) => {
  const { threadId, newName } = req.body;
  try {
    const thread = igClient.entity.directThread(threadId);
    await thread.updateTitle(newName);
    res.sendStatus(200);
  } catch (error) {
    console.error('Failed to change name of chat:', error);
    res.status(500).json({ error: 'Could not change name of chat', details: error.message });
  }
});

function startCheckpoint() {
  return new Promise((resolve) => {
    igClient.challenge.auto(true).then(() => {
      resolve(igClient.challenge);
    });
  });
}

app.post('/addusertolist', async (req, res) => {
  const {userId, usersList} = req.body
  const reponse = await insertUser(userId, usersList, client)  
  res.status(200).json({ reponse }); 
})

app.post('/deleteuserfromlist', async (req, res) => {
  const {userId, del_user_pk} = req.body
  const reponse = await deleteUser(userId, del_user_pk, client)  
  res.status(200).json({ reponse }); 
})

app.post('/getUserList', async (req, res) => {
  const { userId } = req.body;
  const response = await getUserList(userId, client);
  res.status(200).json({ response });
});

app.get('/getFeed', async (req, res) => {
  const followersFeed = igClient.feed.user(userpk)
  const posts = await followersFeed.items();
  res.status(200).json({ posts });
})

app.post('/setTimestampandSeen', async (req, res) => {
  const {userpk, itempk, lastSeenTimestamp} = req.body;
  const response = await setLastSeenTimestamp(userpk, itempk, lastSeenTimestamp, client)
  res.status(200).json({ response });
})

async function getUserListData(userList) {
  if (!userList) {
    return {};
  }

  let userPostsMap = {};

  for (const user of userList.usersList) {
    const followersFeed = igClient.feed.user(user.pk);
    const posts = await followersFeed.items();

    let userNewPosts = [];
    let userOldPosts = [];

    for (let post of posts) {
      const postTimestamp = parseInt(post.taken_at);
      if (greaterTimestamp(parseInt(user.cursor), postTimestamp)) {
        userNewPosts.push(post);
      } else {
        userOldPosts.push(post);
      }
    }

    userPostsMap[user.pk] = {
      newPosts: userNewPosts,
      oldPosts: userOldPosts
    };
  }
  return userPostsMap;
}

function isCheckpointError(error) {
  return (error instanceof IgCheckpointError);
}

function isTwoFactorError(error) {
  return (error instanceof IgLoginTwoFactorRequiredError);
}

// Return true if posttimestamp > dbtimestamp (ie add to list)
function greaterTimestamp(dbTimestamp, postTimestamp) {
  if (dbTimestamp > 9999999999) {
    dbTimestamp = Math.floor(dbTimestamp / 1000);
  }
  const date1 = new Date(postTimestamp * 1000); 
  const date2 = new Date(dbTimestamp); 
  return date1 > date2;
}
