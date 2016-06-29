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

const lengthOfRound = 90000; //ms

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

// Starts a round of pictionary in a given room.
function startRound(room){
    let roomState = roomData.get(room);
    roomState.started = true;
    roomState.artist = roomState.playerList[0]; // We pick the first player
    roomState.startTime = Date.now();
    roomState.word = "Hot Dog" //Todo, get this word from somewhere.
    roomState.playersToFinish = roomState.playerList.slice(1) // The other players.
    io.to(room).emit('startRound',{artist: roomState.artist});
    let artistSocketID = sessionIDtoSocketID.get(roomState.artist);
    io.to(artistSocketID).emit('gameWord', roomState.word);
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
            //There's a small problem with this. If a person leaves a room, their
            //Nick is no longer avaliable for late joiners. I think we have to pick
            //Our battles with this one though.
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
        let session = getSession(socket.id);
        let room = session.room;
        if(!room) return; //very basic gaurd. A bit simple and repetitive.
        let roomMessages = messages.get(room);
        let id = roomMessages.length;

        console.log(id, roomMessages[id]);

        if(data == roomData.get(room).word){ // is the guess correct, if so:
            if(roomData.get(room).playersToFinish.includes(session)){
                // Update their score
                let score = roomData.get(room).scores.get(getSession(socket.id));
                score += (lengthOfRound - Date.now() - roomData.get(room).startTime)/1000;
                roomData.get(room).scores.set(getSession(socket.id),score);
                //Remove the player from list of those to finish
                let index = roomData.get(room).playersToFinish.indexOf(session);
                roomData.get(room).playersToFinish.splice(index, 1);
            }
        }else{
            // Publish the message
            roomMessages.push({id: id,
                           sessionID: socketIDtoSessionID.get(socket.id), 
                           data: data});
            io.to(room).emit('message', roomMessages[id]);
        }

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
            sessionData.set(sessionID, {accessTime: Date.now(), id: sessionID});
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
        // This should keep the socket in it's default room but remove the 
        // one it's been added to.
        console.log(Object.keys(socket.rooms) + " " + socket.id + " " + socket.rooms.length)
        for (let room of Object.keys(socket.rooms)){
            if(room !== socket.id){
                socket.leave(room);
            }
        }
        //if(socket.rooms.length > 1) socket.leave(socket.rooms[1]);
        socket.join(room);

        let session = getSession(socket.id);
        session.room = room;

        //if the room doesn't exist, initialise it.
        if(!roomData.has(room)){
            console.log("Initialising room: " + room);
            roomData.set(room,{ scores: new Map(),
                                started: false,
                                artist: null,
                                word: "",
                                playerList: [],
                                playersToFinish: [],
                                startTime: null});
            messages.set(room,[]);
            strokes.set(room,[]);
        }
        let roomState = roomData.get(room);
        roomState.playerList.push(session);
        roomState.scores.set(session,0);

        if(roomState.playerList.length > 1 && roomState.started === false){
            startRound(room);
        }

        console.log("Client joined room: " + room);
        socket.emit('joinedRoom');

        // We emit this message to notify people in the room of our nick
        io.to(room).emit('nick', { sessionID: session.id, nick: session.nick});

    });

});

http.listen(4000, function() {
    console.log('listening on *:4000');
});
