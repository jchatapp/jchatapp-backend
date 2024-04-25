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

const getChatList = () => {
  const chatsFeed = igClient.feed.directInbox();
  return new Promise((resolve, reject) => {
    chatsFeed.items().then(resolve).catch(reject); 
  });
};

app.post('/login', (req, res) => {
  const { username, password } = req.body; 

  igClient.state.generateDevice(username); 
  
  igClient.simulate.preLoginFlow()
    .then(() => igClient.account.login(username, password)) 
    .then((userData) => {
      console.log("Logged in:", userData.username);

      getChatList()
        .then((chatList) => {
          res.json({
            userData, 
            chatList,
          });
        })
        .catch((error) => {
          console.error("Failed to get chat list:", error); 
          res.status(500).json({ error: 'Failed to retrieve chat list' });
        });
    })
    .catch((error) => {
      console.error("Login failed:", error); 
      res.status(400).json({ error: 'Invalid login credentials' }); 
    });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`); 
});
