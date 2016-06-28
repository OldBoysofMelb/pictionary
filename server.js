"use strict"

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var uuid = require('node-uuid');


app.use(express.static('public'));
app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

var strokes = [];
var messages = [];

var sessionData = new Map(); 
var socketIDtoSessionID = new Map();
// sessionData doesn't store the socket id, so we seperate it out.
var sessionIDtoSocketID = new Map();

io.on('connection', function(socket) {

    // Update the "freshness" of this clients session.
    var session = sessionData.get(socketIDtoSessionID.get(socket.id))
    if(session) session.accessTime = Date.now();


    socket.on('getCurrentStroke', function() {
        socket.emit('currentStroke', strokes.length - 1);
    });

    socket.on('getCurrentMessage', function() {
        socket.emit('currentMessage', messages.length - 1);
    });

    socket.on('getNicks', function(){
        var nicks = []
        for (var [key, value] of sessionData.entries()) {
            nicks.push([key, value.nick]);
        }   
        socket.emit('nicks', nicks);
    });

    socket.on('getStroke', function(id) {
        if (strokes[id]) {
            socket.emit('draw', strokes[id]);
        }
    });

    socket.on('getMessage', function(id) {
        if (messages[id]) {
            socket.emit('message', messages[id]);
        }
    });

    socket.on('getStrokes', function(data) {
        if (strokes[data.start] && strokes[data.end - 1]) {
            socket.emit('drawStrokes', strokes.slice(data.start, data.end));
        }
    });

    socket.on('getMessages', function(data) {
        if (messages[data.start] && messages[data.end - 1]) {
            socket.emit('messages', messages.slice(data.start, data.end));
        }
    });


    socket.on('drawClick', function(data) {
        let id = strokes.push(data) - 1;
        strokes[id]['id'] = id;

        console.log(id, strokes[id]);

        socket.emit('drawReceived', {
            id: id,
            data: data
        });

        socket.broadcast.emit('draw', strokes[id]);
    });

    socket.on('clear', function() {
        strokes = [];

        socket.broadcast.emit('clear');
        console.log('clearing');
    });

    socket.on('message', function(data){
        let id = messages.length;
        messages.push({id: id,
                       sessionID: socketIDtoSessionID.get(socket.id), 
                       data: data});

        console.log(id, messages[id]);

        socket.emit('messageReceived', {
            id: id,
            sessionID: socketIDtoSessionID.get(socket.id),
            data: data
        });

        io.emit('message', messages[id]);
    });

    socket.on('sessionID', function(id){
        console.log("Connection from client with id: " + id);
        if(id === null || !sessionIDtoSocketID.has(id)){
            // Give them a new session ID.
            let sessionID = uuid.v4();
            console.log("issuing new session id: " + sessionID);

            socket.emit('setSessionID', sessionID);

            socketIDtoSessionID.set(socket.id, sessionID);
            sessionIDtoSocketID.set(sessionID, socket.id);
            // Initialise data.
            sessionData.set(sessionID, {accessTime: Date.now()});
        }else{
            /* Update their session ID.
             * We don't unset the old socket.id => session id, which is a
             * memory leak, but I don't think it will lead to issues 
             * (at least logic ones) currently.
             */
            socketIDtoSessionID.set(socket.id, id);
            sessionIDtoSocketID.set(id, socket.id);
        }
    });

    socket.on('requestNick', function(nick){
        // check if nick is unique. 
        let unique = true;
        for (let value of sessionData.values()) {
            console.log(nick + " " + value.nick);
            if(nick === value.nick){
                unique = false;
                break;
            }
        }

        let sessionID = socketIDtoSessionID.get(socket.id);

        if(unique && sessionID){
            // Notify them their nick was accepted
            socket.emit('nickStatus', true);

            // We now set their nick.
            sessionData.get(sessionID).nick = nick;

            // Notify everyone that the nick has been set.
            io.emit('nick', { sessionID: sessionID, nick: nick });
        }else{
            // Notify them that their nick was not allowed.
            socket.emit('nickStatus', false);
        }
    });

});

http.listen(4000, function() {
    console.log('listening on *:4000');
});
