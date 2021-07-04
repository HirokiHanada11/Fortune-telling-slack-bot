const { App } = require('@slack/bolt');
const { MongoClient } = require('mongodb');

const dotenv = require("dotenv");
dotenv.config();

//mongoDB setup
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@clusterforslackapp.qqx16.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const dbclient = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
const dbName = "slackAppUsers";

// Initializes your app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

//import set of functions for handling commands and actions 
const FortuneHandler = require("./fortuneHandling"); 
const dbHandler = require('./dbHandling');

//listens for /fortune command and opens a modal
app.command('/fortune', async({ ack, command, body, client }) => {
  await ack();
  try {
    if (command.text === "me"){
      await FortuneHandler.personalizedFortune(body, client, dbName, dbclient);
      console.log("Success: posted personalized fortune for", body.user_name);
    }else if(command.text === "set"){
      await FortuneHandler.setupPersonalizedFortune(body, client);
      console.log("success: personalization setting modal opened for", body.user_name);
    } else if(command.text === "del"){
      await FortuneHandler.managePersonalizedFortune(body, client, dbName, dbclient);
      console.log("success: opened manage modal")
    } else{
      await FortuneHandler.defaultFortune(body, client);
      console.log("success: opened default menu for",body.user_name)
    }
  }
  catch (error) {
    console.error(error);
  }
});

//when one of the buttons on the modal is clicked, it pushes another modal with fortune telling results
app.action('select_horo', async({ ack, body, client}) => {
  await ack();
  try{
    const horoscope = body.actions[0].selected_option.value;
    const result = await FortuneHandler.fetchFortune(horoscope);
    // Call views.open with the built-in client
    await client.views.push({
      // Pass a valid trigger_id within 3 seconds of receiving it
      trigger_id: body.trigger_id,
      // View payload
      view: {
        type: 'modal',
        // View identifier
        callback_id: 'view_2',
        title: {
          type: 'plain_text',
          text: '今日の運勢'
        },
        blocks: [
          {
            "type": "header",
            "text": {
              "type": "plain_text",
              "text": `${result["matched"].sign}の今日の運勢は、、、${result["matched"].rank}位${result["emojiFace"]}`,
              "emoji": true
            }
          },
          {
            "type": "context",
            "elements": [
              {
                "type": "plain_text",
                "text": result["matched"].content,
                "emoji": true
              }
            ]
          },
          {
            "type": "context",
            "elements": [
              {
                "type": "plain_text",
                "text": `ラッキーアイテムは${result["matched"].item}`,
                "emoji": true
              }
            ]
          },
          {
            "type": "divider"
          },
          {
            "type": "image",
            "image_url": `https://quickchart.io/chart?c=${result["encodedRadarChart"]}`,
            "alt_text": "radar chart"
          },
          {
            "type": "context",
            "elements": [
              {
                "type": "plain_text",
                "text": `金運：${result["matched"].money}  恋愛運：${result["matched"].love}　職運：${result["matched"].job}`,
                "emoji": true
              }
            ]
          },
          {
            "type": "context",
            "elements": [
              {
                "type": "plain_text",
                "text": '今日も一日頑張ろう！！',
                "emoji": true
              }
            ]
          }
        ]
      }
    });
    console.log("Success: posted today's fortune for", result["matched"].sign);
  } catch(err) {
    console.error(err)
  }  
});


//submit handling for modal form and saving it to the mongodb database
app.view("modal-with-inputs", async({ ack, body, client}) => {
  await ack();
  try{
    const userId = await body.user.id;
    const username = await body.user.username;
    const horoscope = await body.view.state.values.static_select.static_select_horoscope.selected_option.value;
    const favPhotoUrlstr = await body.view.state.values.multi_line_input.plain_text_input_photo.value;
    const favPhotoUrlArr = await favPhotoUrlstr.split('\n');
    console.log("successfully received submission"); 

    console.log(favPhotoUrlArr);
    await dbHandler.storeUserInfo(userId, username, horoscope, favPhotoUrlArr, dbName, dbclient);
    console.log("Success: stored user information in the database.")
    await client.views.open({
      // Pass a valid trigger_id within 3 seconds of receiving it
      "trigger_id": body.trigger_id,
      // View payload
      "view": {
        "type": 'modal',
        // View identifier
        "callback_id": 'view_end',
        "title": {
          "type": 'plain_text',
          "text": 'ご記入ありがとうございました！'
        },
        "blocks": [
          {
            "type": "section",
            "block_id": "section_pick_horo",
            "text": {
              "type": "mrkdwn",
              "text": "/fortune me で自分宛ての占いを見てみましょう！"
            }
          }
        ]
      }
    })
  } catch(err){
    console.error(err);
  }
})

//delete handler
app.view("manage_images", async({ ack, body, client}) => {
  await ack();
  try{
    const userId = await body.user.id;
    const checkedUrlArr = await body.view.state.values.checkboxes_for_delete.checkboxes_action.selected_options;
    console.log("successfully received submission"); 
    console.log(body.view.state.values.checkboxes_for_delete.checkboxes_action.selected_options);
    // call handler to delete the urls from the database
    await dbHandler.deleteUserInfo(userId, checkedUrlArr, dbName, dbclient);
    console.log("Success: deleted checked urls from the database.")
    await client.views.open({
      // Pass a valid trigger_id within 3 seconds of receiving it
      "trigger_id": body.trigger_id,
      // View payload
      "view": {
        "type": 'modal',
        // View identifier
        "callback_id": 'view_end',
        "title": {
          "type": 'plain_text',
          "text": 'ご記入ありがとうございました！'
        },
        "blocks": [
          {
            "type": "section",
            "block_id": "section_pick_horo",
            "text": {
              "type": "mrkdwn",
              "text": "/fortune set で写真は追加できます！"
            }
          }
        ]
      }
    })
  } catch(err){
    console.error(err);
  }
})

//import functions for handling mars command 
const marsHanler = require('./marsHandling');
//listens for /mars command
app.command('/mars', async({ command, ack, say }) => {
  await ack();
  try {
    const marsPhotos = await marsHanler.latestPhoto();
    //console.log(marsPhotos);
    let block = await marsHanler.createBlock(command.text, marsPhotos.photos);   
    
    await say({
      blocks :block
    })
    
  }
  catch (error) {
    console.error(error);
  }
});

app.message('', async ({message, say }) => {
  try {
      // Call the conversations.create method using the WebClient

      if (message.channel == "C02772PTUJG") {
        const result = await app.client.conversations.create({
          // The name of the conversation
          name: message.text + ""
        });

        await app.client.chat.postMessage({
          channel: message.channel,
          text: `チャンネルを作成しました->https://testforhackason.slack.com/archives/${result["channel"]["name"]}`
        });
      
        // The result will include information like the ID of the conversation
        //console.log(result);

        await app.client.conversations.invite({
            channel: result["channel"]["id"],
            users: message.user
        });
      }
    }
    catch (error) {
      await say("チャンネルが作成できません");
    }

});

app.message('close', async ({message, say}) => {
  const result = await app.client.conversations.history({
    channel: message.channel,
  });

  var fs = require("fs");
  var file_name = message.channel + ".txt";

  fs.writeFile(file_name, `https://testforhackason.slack.com/archives/${message.channel}\n`, function (err) {
    if (err) {throw err;}
    console.log("writing channle log file,,,");
  });

  result["messages"].reverse().forEach(message => {
    fs.appendFile(file_name, message["text"] + "\n", function (err) {
      if (err) {throw err;}
    });
  });

  await app.client.files.upload({
    channels: "C02772PTUJG",
    initial_comment: `Log file of ${message.channel}`,
    file: fs.createReadStream(file_name)
  });

  await app.client.conversations.archive({
    channel: message.channel
  });

});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log('⚡️ Bolt app is running!');
})();

(async () => {
  try{
    await dbclient.connect();
    console.log("Connected correctly to MongoDB server");
  } catch(error) {
    console.error(error);
  }
})();

process.on('SIGTERM', async () => {
  try{
    await dbclient.close();
    console.log("Correctly closed connection to server");
  } catch(error) {
    console.error(error);
  }
})
const { App } = require('@slack/bolt');

// Initializes your app with your bot token and signing secret
const app = new App({
  token: "xoxb-2216499267651-2250635640657-IwbIlsHuMh2eFXWKqQtet9zt",
  signingSecret: "a1583867411c5482e08ba11d91b56068"
});
// モンゴ
const { MongoClient } = require("mongodb");

// Replace the uri string with your MongoDB deployment's connection string.
const uri =
  "mongodb+srv://masato:jxNKKx6pmn@@4wE@cluster0.t0afd.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";
  
const dbclient = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });


// スラッシュコマンド/post
app.command('/post', async ({ command, ack, say, client, body }) => {
  // Acknowledge command request
  await ack();
  await app.client.reminders.add({
    token: "xoxp-2216499267651-2209799304054-2238251250099-149d3a1993f084640f8c4dd6457cc642",
    text: "delete",
    time: 1155
  }
  )
  try {
    
    const result = await client.views.open({
      // 適切な trigger_id を受け取ってから 3 秒以内に渡す
      trigger_id: body.trigger_id,
      // view の値をペイロードに含む
      view: {
        type: 'modal',
        // callback_id が view を特定するための識別子
        callback_id: 'view_1',
        "title": {
          "type": "plain_text",
          "text": "Modal Title"
        },
        "submit": {
          "type": "plain_text",
          "text": "Submit"
        },
        "blocks": [
          {
            "type": "input",
            "block_id": "block1",
            "element": {
              "type": "plain_text_input",
              "action_id": "sl_input",
              "placeholder": {
                "type": "plain_text",
                "text": "Placeholder text for single-line input"
              }
            },
            "label": {
              "type": "plain_text",
              "text": "Label"
            },
            "hint": {
              "type": "plain_text",
              "text": "Hint text"
            }
          },
          {
            "type": "input",
            "block_id": "block2",
            "element": {
              "type": "plain_text_input",
              "action_id": "ml_input",
              "multiline": true,
              "placeholder": {
                "type": "plain_text",
                "text": "Placeholder text for multi-line input"
              }
            },
            "label": {
              "type": "plain_text",
              "text": "Label"
            },
            "hint": {
              "type": "plain_text",
              "text": "Hint text"
            }
          },
          {
            "type": "input",
            "block_id": "block3",
            "element": {
              "type": "datepicker",
              "initial_date": "1990-04-28",
              "placeholder": {
                "type": "plain_text",
                "text": "Select a date",
                "emoji": true
              },
              "action_id": "datepicker"
            },
            "label": {
              "type": "plain_text",
              "text": "Label",
              "emoji": true
            }
          }
        ],
      }
    });
    console.log(result);
  }
  catch (error) {
    console.error(error);
  }
  // await say(`${command.text}`);
});
// モーダルでのデータ送信イベントを処理します
app.view('view_1', async ({ ack, body, view, client }) => {
  // モーダルでのデータ送信イベントを確認
  await ack();

  // 入力値を使ってやりたいことをここで実装 - DB に保存して送信内容の確認を送っている

  // block_id: block_1 という input ブロック内で action_id: input_a の場合の入力
  const pizzaDocument = {
     title : view.state.values.block1.sl_input.value,
     text : view.state.values.block2.ml_input.value,
     date : view.state.values.block3.datepicker.value,
     user : body['user']['id']
  };
  const user = body['user']['id'];
  // ユーザーに対して送信するメッセージ
  let msg = '';
  // DB に保存
  const database = dbclient.db("masato");
  const movies  = database.collection("movies");
  const results = await movies.insertOne(pizzaDocument);

  if (results) {
    // DB への保存が成功
    msg = 'Your submission was successful';
  } else {
    msg = 'There was an error with your submission';
  }

  // ユーザーにメッセージを送信
  try {
    
    
    // const apple = {
      //   title: "a",
      //   text: "b",
      //   date: 2
      // }
      
      // const database = dbclient.db("masato");
      // const movies = database.collection("movies");
      // const dt = await movies.findOne(pizzaDocument); 
      
      await client.chat.postMessage({
      channel: user,
      text: msg,
      
      blocks: [
        {
          "type": "section",
          "text": {
            "type": "plain_text",
            "text": "dt.date",
            "emoji": true
          }
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "plain_text",
              "text": "dt.title",
              "emoji": true
            },
            {
              "type": "plain_text",
              "text": "dt.text",
              "emoji": true
            },
            
          ]
        }
      ],
    });
  }
  catch (error) {
    console.error(error);
  }

});
(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);
  await dbclient.connect();
  console.log('⚡️ Bolt app is running!');
})();
// モンゴ
const { MongoClient } = require("mongodb");

// Replace the uri string with your MongoDB deployment's connection string.
const uri =
  "mongodb+srv://masato:jxNKKx6pmn@@4wE@cluster0.t0afd.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";
  
const dbclient = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });


// スラッシュコマンド/post
app.command('/post', async ({ command, ack, say, client, body }) => {
  // Acknowledge command request
  await ack();
  await app.client.reminders.add({
    token: "xoxp-2216499267651-2209799304054-2238251250099-149d3a1993f084640f8c4dd6457cc642",
    text: "delete",
    time: 1155
  }
  )
  try {
    
    const result = await client.views.open({
      // 適切な trigger_id を受け取ってから 3 秒以内に渡す
      trigger_id: body.trigger_id,
      // view の値をペイロードに含む
      view: {
        type: 'modal',
        // callback_id が view を特定するための識別子
        callback_id: 'view_1',
        "title": {
          "type": "plain_text",
          "text": "Modal Title"
        },
        "submit": {
          "type": "plain_text",
          "text": "Submit"
        },
        "blocks": [
          {
            "type": "input",
            "block_id": "block1",
            "element": {
              "type": "plain_text_input",
              "action_id": "sl_input",
              "placeholder": {
                "type": "plain_text",
                "text": "Placeholder text for single-line input"
              }
            },
            "label": {
              "type": "plain_text",
              "text": "Label"
            },
            "hint": {
              "type": "plain_text",
              "text": "Hint text"
            }
          },
          {
            "type": "input",
            "block_id": "block2",
            "element": {
              "type": "plain_text_input",
              "action_id": "ml_input",
              "multiline": true,
              "placeholder": {
                "type": "plain_text",
                "text": "Placeholder text for multi-line input"
              }
            },
            "label": {
              "type": "plain_text",
              "text": "Label"
            },
            "hint": {
              "type": "plain_text",
              "text": "Hint text"
            }
          },
          {
            "type": "input",
            "block_id": "block3",
            "element": {
              "type": "datepicker",
              "initial_date": "1990-04-28",
              "placeholder": {
                "type": "plain_text",
                "text": "Select a date",
                "emoji": true
              },
              "action_id": "datepicker"
            },
            "label": {
              "type": "plain_text",
              "text": "Label",
              "emoji": true
            }
          }
        ],
      }
    });
    console.log(result);
  }
  catch (error) {
    console.error(error);
  }
  // await say(`${command.text}`);
});
// モーダルでのデータ送信イベントを処理します
app.view('view_1', async ({ ack, body, view, client }) => {
  // モーダルでのデータ送信イベントを確認
  await ack();

  // 入力値を使ってやりたいことをここで実装 - DB に保存して送信内容の確認を送っている

  // block_id: block_1 という input ブロック内で action_id: input_a の場合の入力
  const pizzaDocument = {
     title : view.state.values.block1.sl_input.value,
     text : view.state.values.block2.ml_input.value,
     date : view.state.values.block3.datepicker.value,
     user : body['user']['id']
  };
  const user = body['user']['id'];
  // ユーザーに対して送信するメッセージ
  let msg = '';
  // DB に保存
  const database = dbclient.db("masato");
  const movies  = database.collection("movies");
  const results = await movies.insertOne(pizzaDocument);

  if (results) {
    // DB への保存が成功
    msg = 'Your submission was successful';
  } else {
    msg = 'There was an error with your submission';
  }

  // ユーザーにメッセージを送信
  try {
    
    
    // const apple = {
      //   title: "a",
      //   text: "b",
      //   date: 2
      // }
      
      // const database = dbclient.db("masato");
      // const movies = database.collection("movies");
      // const dt = await movies.findOne(pizzaDocument); 
      
      await client.chat.postMessage({
      channel: user,
      text: msg,
      
      blocks: [
        {
          "type": "section",
          "text": {
            "type": "plain_text",
            "text": "dt.date",
            "emoji": true
          }
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "plain_text",
              "text": "dt.title",
              "emoji": true
            },
            {
              "type": "plain_text",
              "text": "dt.text",
              "emoji": true
            },
            
          ]
        }
      ],
    });
  }
  catch (error) {
    console.error(error);
  }

});
(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);
  await dbclient.connect();
  console.log('⚡️ Bolt app is running!');
})();