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

io.on('connection', function(socket) {
    socket.on('getCurrent', function() {
        socket.emit('current', strokes.length - 1);
    });

    socket.on('getStroke', function(id) {
        if (strokes[id]) {
            socket.emit('draw', strokes[id]);
        }
    });

    socket.on('getStrokes', function(data) {
        if (strokes[data.start] && strokes[data.end - 1]) {
            socket.emit('drawStrokes', strokes.slice(data.start, data.end));
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
});

http.listen(4000, function() {
    console.log('listening on *:4000');
});
