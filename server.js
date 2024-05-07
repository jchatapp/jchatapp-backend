const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { IgApiClient } = require('instagram-private-api');
const igClient = new IgApiClient();

const app = express();
const port = 8000; 

app.use(bodyParser.json()); 
app.use(cors()); 

app.get('/health', (req, res) => {
  res.status(200).send('Server is running'); 
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    igClient.state.generateDevice(username); 
    await igClient.simulate.preLoginFlow(); 
    const userData = await igClient.account.login(username, password); 
    const chatList = await igClient.feed.directInbox().items();
    res.json({
      userData, 
      chatList, 
    });
  } catch (error) {
    console.error('Login failed:', error); 
    res.status(400).json({ error: 'Invalid login credentials' }); 
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
    const messages = await thread.items();
    const moreAvailable = thread.isMoreAvailable();

    res.json({
      messages: messages,
      cursor: thread.cursor, 
      moreAvailable: moreAvailable 
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
    const moreAvailable = thread.isMoreAvailable();
    const filteredMessages = messages.filter(message => parseInt(message.timestamp, 10) > parseInt(last_timestamp, 10));

    res.json({
      messages: filteredMessages,
      moreAvailable: moreAvailable
    });
  } catch (error) {
    console.error('Failed to fetch new messages:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`); 
});
