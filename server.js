"use strict"

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.use(express.static('public'));
app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

var strokes = [];
var messages = [];

io.on('connection', function(socket) {
    socket.on('getCurrentStroke', function() {
        socket.emit('currentStroke', strokes.length - 1);
    });

    socket.on('getCurrentMessage', function() {
        socket.emit('currentMessage', messages.length - 1);
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
        let id = strokes.length;
        strokes.push({id: id, data: data});

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
        messages.push({id: id, data: data});

        console.log(id, messages[id]);

        socket.emit('messageReceived', {
            id: id,
            data: data
        });

        io.emit('message', messages[id]);
    });

});

http.listen(4000, function() {
    console.log('listening on *:4000');
});
