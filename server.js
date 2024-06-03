const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { IgApiClient, IgCheckpointError, IgLoginTwoFactorRequiredError } = require('instagram-private-api');
const { writeFile, readFile } = require('fs/promises');
let igClient = new IgApiClient();
let user;
let pass;
const app = express();
const port = 8000; 

app.use(bodyParser.json()); 
app.use(cors()); 

app.listen(port, () => {
  console.log(`Server running on port ${port}`); 
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

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  user = username;
  pass = password;

  try {
    const userData = await login(username, password);
    const chatList = await igClient.feed.directInbox().items();
    const userInfo = await igClient.user.info(userData.pk);
    res.json({
      userData, 
      chatList, 
      userInfo
    });
  } catch (error) {
    console.error(error)
    if (isCheckpointError(error)) {
      try {
        console.log('Handling checkpoint error...');
        await ig.challenge.auto(true);
        console.log('Checkpoint handled');
      } catch (checkpointError) {
        console.error('Failed to handle checkpoint error:', checkpointError);
        return res.status(500).json({ error: 'Failed to handle checkpoint error' });
      }
    }
    console.error('Login failed:', error); 
    if (error.name === "IgCheckpointError") {
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
        console.log('Waiting 7 seconds before reinitializing igClient...');
        await new Promise(resolve => setTimeout(resolve, 7000));
        igClient = new IgApiClient();
        console.log('Done waiting');
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
        await ig.challenge.auto(true);
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