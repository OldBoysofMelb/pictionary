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

const lengthOfRound = 100*1000; //ms

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

function sendScores(room){
    let roomState = roomData.get(room);
    let scores = [];
    for (let [key, value] of roomState.scores.entries()) {
        scores.push([key, value]);
    }
    io.to(room).emit('scores', scores);
}

function clearOldSessions(room){
    for(let [key, value] in sessionData.entries()){
        if(value.room === room && Date.Now() - value.accessTime > 2*60*1000){
            socketIDtoSessionID.delete(sessionIDtoSocketID.get(key));
            sessionIDtoSocketID.delete(key);
            sessionData.delete(key);
            leaveRoom(key,value.room);
        }
    }
}

function initialiseRoom(room){
    roomData.set(room,{ scores: new Map(),
                        started: false,
                        artist: null,
                        word: "",
                        playerList: [],
                        playersToFinish: [],
                        startTime: null,
                        turn: 0});
    messages.set(room,[]);
    strokes.set(room,[]);
}

// Starts a round of pictionary in a given room.
function startRound(room){
    console.log("Room : " + room);
    let roomState = roomData.get(room);
    clearRoom(room);

    roomState.started = true;
    roomState.artist = roomState.playerList[roomState.turn]; // We pick the first player
    roomState.startTime = Date.now();
    roomState.word = "Hot Dog" //Todo, get this word from somewhere.
    roomState.timer = setTimeout(endRound,lengthOfRound,room);

    let currentplayers = roomState.playerList.slice() // Copy of array
    currentplayers.splice(roomState.turn,1) // The other players.
    roomState.playersToFinish = currentplayers;

    io.to(room).emit('startRound',{artist: roomState.artist});
    let artistSocketID = sessionIDtoSocketID.get(roomState.artist);
    console.log("Releasing the game word to client with id: " + roomState.artist);
    io.to(artistSocketID).emit('gameWord', roomState.word);

    roomState.turn += 1;
}

function endRound(room){
    let roomState = roomData.get(room);
    clearTimeout(roomState.timer);
    if(roomState.turn >= roomState.playerList.length) roomState.turn = 0;
    clearOldSessions(room);
    sendScores(room);
    if(roomState.started) startRound(room);
}

function clearRoom(room){
    if(!room) return; //very basic gaurd. A bit simple and repetitive.
    strokes.set(room,[]);
    io.to(room).emit('clear');
    console.log('clearing');
}

function leaveRoom(playerID, roomID){
    if(!roomData.has(roomID)) return; // Very basic guard lol
    let index = roomData.get(roomID).playerList.indexOf(playerID);
    roomData.get(roomID).playerList.splice(index, 1);
    roomData.get(roomID).scores.delete(playerID);
    if(roomData.get(roomID).playerList.length <= 1){
        roomData.get(roomID).started = false;
        endRound(roomID);
    }
    if(roomData.get(roomID).playerList.length === 0){
        roomData.delete(roomID);
    }
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
        let nicks = [];
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
        // Only allow drawing if this is the artist.
        if(socketIDtoSessionID.get(socket.id) === roomData.get(room).artist){
            let id = roomStrokes.push(data) - 1;
            roomStrokes[id]['id'] = id;

            console.log(id, roomStrokes[id]);

            socket.emit('drawReceived', {
                id: id,
                data: data
            });
            socket.broadcast.to(room).emit('draw', roomStrokes[id]);
        }
    });

    on(socket,'clear', function() {

        let room = getSession(socket.id).room;
        if(socketIDtoSessionID.get(socket.id) === roomData.get(room).artist){
            clearRoom(room);
        }
    });

    on(socket,'message', function(data){
        let session = getSession(socket.id);
        let room = session.room;
        if(!room) return; //very basic gaurd. A bit simple and repetitive.

        // Prevent the artist from sending messages.
        if(socketIDtoSessionID.get(socket.id) !== roomData.get(room).artist){

            let roomMessages = messages.get(room);
            let id = roomMessages.length;

            console.log(id, roomMessages[id]);

            if(data == roomData.get(room).word){ // is the guess correct, if so:
                if(roomData.get(room).playersToFinish.includes(session.id)){
                    // Update their score
                    let score = roomData.get(room).scores.get(session.id);
                    score += Math.round((lengthOfRound- ( Date.now() - roomData.get(room).startTime))/1000);
                    roomData.get(room).scores.set(session.id,score);
                    //Remove the player from list of those to finish
                    let index = roomData.get(room).playersToFinish.indexOf(session.id);
                    roomData.get(room).playersToFinish.splice(index, 1);
                    if(roomData.get(room).playersToFinish.length === 0){
                        endRound(room);
                    }
                }
            }else{
                // Publish the message
                roomMessages.push({id: id,
                               sessionID: socketIDtoSessionID.get(socket.id), 
                               data: data});
                io.to(room).emit('message', roomMessages[id]);
            }
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

        let sessionID = socketIDtoSessionID.get(socket.id);3

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

        let session = getSession(socket.id);

        // This should keep the socket in it's default room but remove the 
        // one it's been added to.
        for (let room of Object.keys(socket.rooms)){
            if(room !== socket.id){
                socket.leave(room);
                leaveRoom(session.id,room);
            }
        }
        socket.join(room);

        session.room = room;

        //if the room doesn't exist, initialise it.
        if(!roomData.has(room)){
            console.log("Initialising room: " + room);
            initialiseRoom(room);
        }
        let roomState = roomData.get(room);
        roomState.playerList.push(session.id);
        roomState.scores.set(session.id,0);

        if(roomState.playerList.length > 1 && roomState.started === false){
            startRound(room);
        }

        console.log("Client joined room: " + room);
        socket.emit('joinedRoom');

        // We emit this message to notify people in the room of our nick
        io.to(room).emit('nick', { sessionID: session.id, nick: session.nick});

    });

    on(socket,'leaveRoom', function(){
        let session = getSession(socket.id);
        let room = session.room;
        if(room){
            socket.leave(room);
            leaveRoom(session.id,room);
        }            
    });

});

http.listen(4000, function() {
    console.log('listening on *:4000');
});
