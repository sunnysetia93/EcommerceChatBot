var restify = require('restify');
var builder = require('botbuilder');
var mainMenu = require('./Menus/mainMenu')
var products = require('./Models/products')
var Cart = require('./Models/cart')
var config = require('./config')
var CartData = []
var CartTotal = 0;

// For demo purposes only. These keys should idealy be stored in .env file.
var luisAppId = config.luisAppId;
var luisAPIKey = config.luisAPIKey;
var luisAPIHostName = config.luisAPIHostName;

const LuisModelUrl =
  'https://' +
  luisAPIHostName +
  '/luis/v2.0/apps/' +
  luisAppId +
  '?subscription-key=' +
  luisAPIKey +
  '&timezoneOffset=-360&q=';


var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 5000, function () {
   console.log('%s listening to %s', server.name, server.url); 
});

var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});

const inMemoryStorage = new builder.MemoryBotStorage();


server.post('/api/messages', connector.listen());

var bot = new builder.UniversalBot(connector, function (session) {
    session.userData.flag=false;
    session.beginDialog('mainMenu');
}).set('storage', inMemoryStorage); 

var recognizer = new builder.LuisRecognizer(LuisModelUrl);
bot.recognizer(recognizer);

bot.dialog('mainMenu',[(session)=>{
    session.userData.Cart=CartData
    var message = "Kindly Select an option from the Menu";
    if(session.userData.flag==false){
        message = "Welcome to E-Kart. Kindly Select an option from the Menu!"
        session.userData.flag=true;
    }
    session.send(message);
    builder.Prompts.choice(session,"Menu:",mainMenu,{listStyle:3});
    },

    (session,results,next)=>{
        if(results.response){
            var choice = mainMenu[results.response.entity];
            session.beginDialog(choice.Description);
            next();
        }
    },
    (session=>{
        session.endConversation();

    })])
    .triggerAction({
        matches:'MainMenu'
    })

bot.dialog('listProducts',[
    (session)=>{

        if (session.message && session.message.value) {
            var prod = products[session.message.value.id];
            session.dialogData.productSearch=undefined
            var newItem = new Cart(CartData.length,prod.id,1,prod.price);
            CartData.push(newItem)
            session.userData.Cart = CartData
            CartData.forEach((value)=>{
                CartTotal+=parseInt(value.total);
            })
            session.endDialog();
            session.beginDialog('mainMenu');
            return; 
        }
        else{
            var cards = [getProducts(0),getProducts(1),getProducts(2)]
            var adaptiveCardMessage = new builder.Message(session)
            .attachmentLayout(builder.AttachmentLayout.carousel)
            .attachments(cards);
            session.send('These are all the products that we have to offer:')
            session.send(adaptiveCardMessage);        
            
        }
    },


])
.triggerAction({
    matches: 'ListProducts'
})


bot.dialog('searchProduct',[
    (session,args,next)=>{
        if((args==undefined || args==null) && session.dialogData.productSearch!=undefined){
            next();
        }
        else{
            
            if((args==undefined || args==null) && session.dialogData.productSearch==undefined ){
                builder.Prompts.text(session,"Enter name of the Item you are looking for?");
                next();
            }
            else if(args!=undefined){
                var intent = args.intent;
                var productNameEntity = builder.EntityRecognizer.findEntity(intent.entities, 'productName');
                if(productNameEntity==undefined||productNameEntity==null){
                    builder.Prompts.text(session,"Enter name of the Item you are looking for?");
                }
                else{
                    session.dialogData.productSearch=productNameEntity.entity;
                    next();
                }
    
            }
        }

    },
    (session,results)=>{
        if (session.message && session.message.value) {

            var prod = products[session.message.value.id];
            session.dialogData.productSearch=undefined
            var newItem = new Cart(CartData.length,prod.id,1,prod.price);
            CartData.push(newItem)
            session.userData.Cart = CartData
            CartData.forEach((value)=>{
                CartTotal+=parseInt(value.total);
            })
            session.endDialog();
            session.beginDialog('mainMenu');
            return; 
        }
        else{
            session.dialogData.productSearch = results.response==undefined?session.dialogData.productSearch:results.response;
            session.dialogData.productSearch = session.dialogData.productSearch.toLowerCase();
            var data = products.filter(ele=>{
                if(ele.title.toLowerCase().includes(session.dialogData.productSearch) || ele.tags.toLowerCase().includes(session.dialogData.productSearch) ){
                    return true
                }
            })
            if(data && data.length==0){
                session.send('Sorry but we currently don\'t have the product you are looking for.')
                session.endDialog();
            }
            else{
                var cards = []
                data.forEach((value)=>{
                    cards.push(getProducts(value.id))
                })
                var adaptiveCardMessage = new builder.Message(session)
                .attachmentLayout(builder.AttachmentLayout.carousel)
                .attachments(cards);
                session.send(adaptiveCardMessage);
            }
        }

    }
])
.triggerAction({
    matches:'SearchProducts'
})

bot.dialog('cartStatus',[
    (session)=>{
        if (session.message && session.message.value) {
            var cartProd = CartData[session.message.value.id];
            var prod = products[cartProd.productId];
            session.dialogData.productSearch=undefined
            CartData.splice(cartProd.id,1);
            session.userData.cartProducts=CartData;
            session.endDialog();
            session.beginDialog('mainMenu');
            return; 
        }
        else{
            
            var cards = []
            CartTotal=0;
            CartData.forEach((value)=>{
                CartTotal+=parseInt(value.total);
                cards.push(cartProducts(value))
            })


            if(cards.length==0){
                session.send('Your cart is empty!')
                session.endDialog();
                session.beginDialog('mainMenu');

            }
            else{
                var adaptiveCardMessage = new builder.Message(session)
                .attachmentLayout(builder.AttachmentLayout.carousel)
                .attachments(cards);
                session.send(adaptiveCardMessage);
                session.send(`Cart Total: INR ${CartTotal}`);
            }
            
        }
    },
    (session,results)=>{

        session.endDialog();
    }
])
.triggerAction({
    matches:'CartStatus'
})

bot.dialog('checkout',[
    (session)=>{
        if(CartTotal==0){
            session.send('Looks like your cart is empty.')
        }
        else{
            builder.Prompts.text(session,'Please provide your address?')
        }
    },
    (session,results)=>{
        if(results.response){
            session.userData.address=results.response;
            builder.Prompts.text(session, `Cart Total: INR ${CartTotal} \n Are you sure you wish to place the order?`);
        }
    },
    (session,results)=>{
        if(results.response){
            if(results.response=='yes' || results.response=='Yes' || results.response=='y' || results.response=='Y' || results.response=='YES'){
                session.send(`Order Placed. Total Amount to be paid at the time of delivery: INR ${CartTotal}. \n Order will be delivered to the address: ${session.userData.address} within 7 days. Thank you for shopping with us. `)
                CartTotal=0;
                CartData = [];
            }
            else{
                session.send('Since your reply is not yes, We assume you need to shop some more :D')
            }
            session.endDialog();
        }
    }
 
])
.triggerAction({
    matches:'Checkout'
})


function getProducts(id) {
    return {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.0",
            "body": [
                {
                    "type": "ColumnSet",
                    "columns": [
                        {
                            "type": "Column",
                            "width": 2,
                            "items": [
                                {
                                    "type": "TextBlock",
                                    "text": products[id].category
                                },
                                {
                                    "type": "TextBlock",
                                    "text": products[id].title,
                                    "weight": "bolder",
                                    "size": "extraLarge",
                                    "spacing": "none"
                                },
                                {
                                    "type": "TextBlock",
                                    "text": `${products[id].rating} ★★★☆ (93) · $$`,
                                    "isSubtle": true,
                                    "spacing": "none"
                                },
                                {
                                    "type": "TextBlock",
                                    "text": `Price : Rs. ${products[id].price}`,
                                    "size": "small",
                                    "wrap": true
                                }
                            ]
                        },
                        {
                            "type": "Column",
                            "width": 1,
                            "items": [
                                {
                                    "type": "Image",
                                    "url": products[id].pic,
                                    "size": "auto"
                                }
                            ]
                        }
                    ]
                }
            ],
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Add to Cart",
                        "data": { 
                            "choice": "Submit.Feedback",
                            "id":id
                        }
                },
                {
                    "type": "Action.OpenUrl",
                    "title": "More Info",
                    "url": products[id].link
                }
            ]
        }
    }    
}

function cartProducts(cart) {

    var product = products[cart.productId]
    return {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.0",
            "body": [
                {
                    "type": "ColumnSet",
                    "columns": [
                        {
                            "type": "Column",
                            "width": 2,
                            "items": [
                                {
                                    "type": "TextBlock",
                                    "text": product.category
                                },
                                {
                                    "type": "TextBlock",
                                    "text": product.title,
                                    "weight": "bolder",
                                    "size": "extraLarge",
                                    "spacing": "none"
                                },
                                {
                                    "type": "TextBlock",
                                    "text": `${product.rating} ★★★☆ (93) · $$`,
                                    "isSubtle": true,
                                    "spacing": "none"
                                },
                                {
                                    "type": "TextBlock",
                                    "text": `Price : Rs. ${product.price}`,
                                    "size": "small",
                                    "wrap": true
                                }
                            ]
                        },
                        {
                            "type": "Column",
                            "width": 1,
                            "items": [
                                {
                                    "type": "Image",
                                    "url": product.pic,
                                    "size": "auto"
                                }
                            ]
                        }
                    ]
                }
            ],
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Remove from Cart",
                        "data": { 
                            "choice": "Submit.Feedback",
                            "id":cart.id
                        }
                },
                {
                    "type": "Action.OpenUrl",
                    "title": "More Info",
                    "url": product.link
                }
            ]
        }
    }

    
}

