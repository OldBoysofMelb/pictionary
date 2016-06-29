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

var strokes = new Map(); // room name to array of strokes
var messages = new Map(); // room name to array of messages
var roomData = new Map(); // room name to object containing game state

var sessionData = new Map(); 
var socketIDtoSessionID = new Map();
// sessionData doesn't store the socket id, so we seperate it out.
var sessionIDtoSocketID = new Map();

// This function is what we use instead of socket.on(eventname, callback)
// It keeps track of the last time a session was accessed
function on(socket,eventname,callback){
    function wrappedCallback(){
        if(socketIDtoSessionID.has(socket.id)){
            // Update the "freshness" of this clients session.
            var session = sessionData.get(socketIDtoSessionID.get(socket.id))
            if(session) session.accessTime = Date.now();
        }
        return callback.apply(this, arguments);
    }

    socket.on(eventname,wrappedCallback);
}

// This function returns a session object given a socketID
// We could also add functions to safely set values in the session
function getSession(socketID){
    let sessionID = socketIDtoSessionID.get(socketID);
    if(sessionID === undefined) return null;
    let session = sessionData.get(sessionID);
    return session;
}

io.on('connection', function(socket) {

    on(socket,'getCurrentStroke', function() {
        let room = getSession(socket.id).room;
        if(!room) return; //very basic gaurd. A bit simple and repetitive.
        socket.emit('currentStroke', strokes.get(room).length - 1);
    });

    on(socket,'getCurrentMessage', function() {
        let room = getSession(socket.id).room;
        if(!room) return; //very basic gaurd. A bit simple and repetitive.
        socket.emit('currentMessage', messages.get(room).length - 1);
    });

    on(socket,'getNicks', function(){
        var nicks = [];
        let room = getSession(socket.id).room;
        if(!room) return; //very basic gaurd. A bit simple and repetitive.
        for (var [key, value] of sessionData.entries()) {
            // There might be a smarter way of doing this, but I don't know
            if(value.room == room) nicks.push([key, value.nick]);
        }   
        socket.emit('nicks', nicks);
    });

    on(socket,'getStroke', function(id) {
        let room = getSession(socket.id).room;
        if(!room) return; //very basic gaurd. A bit simple and repetitive.
        if (strokes.get(room)[id]) {
            socket.emit('draw', strokes.get(room)[id]);
        }
    });

    on(socket,'getMessage', function(id) {
        let room = getSession(socket.id).room;
        if(!room) return; //very basic gaurd. A bit simple and repetitive.
        if (messages.get(room)[id]) {
            socket.emit('message', messages.get(room)[id]);
        }
    });

    on(socket,'getStrokes', function(data) {
        let room = getSession(socket.id).room;
        if(!room) return; //very basic gaurd. A bit simple and repetitive. 
        let roomStrokes = strokes.get(room);

        if (roomStrokes[data.start] && roomStrokes[data.end - 1]) {
            socket.emit('drawStrokes', roomStrokes.slice(data.start, data.end));
        }
    });

    on(socket,'getMessages', function(data) {
        let room = getSession(socket.id).room;
        if(!room) return; //very basic gaurd. A bit simple and repetitive.
        let roomMessages = messages.get(room);
        if (roomMessages[data.start] && roomMessages[data.end - 1]) {
            socket.emit('messages', roomMessages.slice(data.start, data.end));
        }
    });


    on(socket,'drawClick', function(data) {
        let room = getSession(socket.id).room;
        if(!room) return; //very basic gaurd. A bit simple and repetitive.
        let roomStrokes = strokes.get(room);

        let id = roomStrokes.push(data) - 1;
        roomStrokes[id]['id'] = id;

        console.log(id, roomStrokes[id]);

        socket.emit('drawReceived', {
            id: id,
            data: data
        });
        socket.broadcast.to(room).emit('draw', roomStrokes[id]);
    });

    on(socket,'clear', function() {
        strokes = [];
        let room = getSession(socket.id).room;
        if(!room) return; //very basic gaurd. A bit simple and repetitive.

        socket.broadcast.to(room).emit('clear');
        console.log('clearing');
    });

    on(socket,'message', function(data){
        let room = getSession(socket.id).room;
        if(!room) return; //very basic gaurd. A bit simple and repetitive.
        let roomMessages = messages.get(room);
        let id = roomMessages.length;

        roomMessages.push({id: id,
                       sessionID: socketIDtoSessionID.get(socket.id), 
                       data: data});

        console.log(id, roomMessages[id]);

        socket.emit('messageReceived', {
            id: id,
            sessionID: socketIDtoSessionID.get(socket.id),
            data: data
        });
        io.to(room).emit('message', roomMessages[id]);
    });

    on(socket,'sessionID', function(id){
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

    on(socket,'requestNick', function(nick){
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
            let room = getSession(socket.id).room;
            if(!room) return; //very basic gaurd. A bit simple and repetitive.
            io.to(room).emit('nick', { sessionID: sessionID, nick: nick });
        }else{
            // Notify them that their nick was not allowed.
            socket.emit('nickStatus', false);
        }
    });

    on(socket, 'joinRoom', function(room){
        for (let r in socket.rooms){
            socket.leave(r);
        }
        socket.join(room);

        getSession(socket.id).room = room;

        //if the room doesn't exist, initialise it.
        if(!roomData.has(room)){
            console.log("Initialising room: " + room);
            roomData.set(room,{});
            messages.set(room,[]);
            strokes.set(room,[]);
        }

        console.log("Client joined room: " + room);
        socket.emit('joinedRoom');
    })

});

http.listen(4000, function() {
    console.log('listening on *:4000');
});
