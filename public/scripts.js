"use strict";

document.addEventListener("DOMContentLoaded", function(event) {
    var canvas = document.getElementById("canvas");
    var ctx = canvas.getContext("2d");

    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = $("select option:selected")[0].value;

    var nicks = new Map();
    var socket = io('http://localhost:4000');

    var strokes = {};
    var currentStroke = 0;

    var messages = {};
    var currentMessage = 0;

    // Game state
    var Game = {};
    Game.artist = "";
    Game.players = [];
    Game.scores = new Map();

    function draw(x, y, type, colour, size) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = size;
        if (type === "dragstart") {
            ctx.beginPath();
            ctx.moveTo(x, y);
        } else if (type === "drag") {
            ctx.lineTo(x, y);
            ctx.stroke();
        } else {
            ctx.closePath();
        }
        ctx.strokeStyle = $("select option:selected")[0].value;
        ctx.lineWidth = $("#size")[0].value;
    }

    function clear() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function clearMessages(){
        $('#messages').empty();
    }

    function showMessage(sessionID, message) {
        let username = nicks.get(sessionID);
        $('#messages').append($('<div>').text(username + ": " + message));
        $('#messages').scrollTop($('#messages')[0].scrollHeight);
    }

    function getSessionID(){
        return localStorage.getItem('sessionID');
    }

    socket.emit('sessionID', getSessionID());


    function requestMissing(name, list, currentPos) {
        var keys = Object.getOwnPropertyNames(list).map(Number);

        if (keys[0] != 0) {
            keys.unshift(-1);
        }

        if (keys[keys.length - 1] != currentPos) {
            keys.push(currentPos + 1);
        }

        for (var i = 0; i < keys.length - 1; i++) {
            if (keys[i+1] - keys[i] == 2) {
                socket.emit('get'+name, keys[i] + 1);
            } else if (keys[i+1] - keys[i] > 2) {
                socket.emit('get'+name+'s', {
                    start: keys[i] + 1,
                    end: keys[i+1]
                });
            }
        }
    }

    function requestMissingStrokes() {
        requestMissing('Stroke',strokes,currentStroke);
    }

    function requestMissingMessages() {
        requestMissing('Message',messages,currentMessage);
    }

    socket.on('joinedRoom', function(){
        // Clear display
        clear();
        clearMessages();

        // Clear out local data.
        nicks = new Map();
        strokes = {};
        currentStroke = 0;
        messages = {};
        currentMessage = 0;

        // Request it from server.
        socket.emit('getNicks');
        socket.emit('getCurrentStroke');
        socket.emit('getCurrentMessage');

        /* We could have remembered old rooms data, but we shouldn't be 
         * switching often, so resending all the data from the server is
         * fine.
         */
    })

    socket.on('setSessionID', function(data) {
        localStorage.setItem('sessionID', data);
    })

    socket.on('currentStroke', function (data) {
        currentStroke = data;
        //window.console.log(currentStroke);

        if (strokes.length != currentStroke) {
            requestMissingStrokes();
        }
    });

    socket.on('currentMessage', function (data) {
        currentMessage = data;
        //window.console.log(currentMessage);

        if (messages.length != currentMessage) {
            requestMissingMessages();
        }
    });


    socket.on('draw', function(data) {
        strokes[data.id] = data;

        return draw(data.x, data.y, data.type, data.colour, data.size);
    });

    socket.on('drawStrokes', function(data) {
        for (var i in data) {
            strokes[data[i].id] = data[i];
            draw(data[i].x, data[i].y, data[i].type, data[i].colour, data[i].size);
        }
    });

    socket.on('messages', function(data) {
        for (var i in data) {
            messages[data[i].id] = data[i];
            showMessage(data[i].sessionID, data[i].data);
        }
    });


    socket.on('drawReceived', function(data) {
        strokes[data.id] = data.data;
    });

    socket.on('clear', function() {
        clear();
        strokes = {};
    });

    socket.on('message', function(data){
        messages[data.id] = data;
        showMessage(data.sessionID, data.data);
    });

    socket.on('nick', function(data){
        nicks.set(data.sessionID, data.nick);
    });

    socket.on('nicks', function(data){
        // We receive a list of key value pairs. We then add this to our map.
        for (let entry of data){
            nicks.set(entry[0], entry[1]);
        }
    });

    socket.on('scores', function(data){
        // We receive a list of key value pairs. We then add this to our map.
        $('#scores').empty();
        for (let entry of data){
            Game.scores.set(entry[0], entry[1]);
            $('#scores').append($('<div>').text(nicks.get(entry[0]) + ": " + entry[1]));
        }
    });

    socket.on('nickStatus', function(accepted){
        if(accepted){
            $('#nick').val('Your Nick is now set.');
        }else{
            $('#nick').val('Nick already taken!');
        }
    });

    socket.on('gameWord', function(word){
        $("#gameStatus").text("You are drawing " + word);
    });

    socket.on('startRound', function(data){
        if(data.artist != getSessionID()){
            $("#gameStatus").text("You are guessing");
        }else{
            // TODO any changes for artist aside from gameWord message.
        }
    });

    $('canvas').on('drag dragstart dragend', function(e) {
        var offset, type, x, y, colour, size;
        colour = ctx.strokeStyle;
        size = ctx.lineWidth;
        type = e.handleObj.type;
        offset = $(this).offset();
        e.offsetX = e.pageX - offset.left;
        e.offsetY = e.pageY - offset.top;
        x = e.offsetX;
        y = e.offsetY;
        draw(x, y, type, colour, size);
        socket.emit('drawClick', {
            x: x,
            y: y,
            type: type,
            colour: colour,
            size: size
        });
    });

    $('#clear').on('click', function(e) {
        clear();
        socket.emit('clear');
    });

    $('select').change(function() {
        ctx.strokeStyle = $("select option:selected")[0].value;
    });

    $('#size').change(function() {
        ctx.lineWidth = $("#size")[0].value;
    });


    $('form').submit(function() {
        socket.emit('message', $('#m').val());
        $('#m').val('');
        return false;
    });

    $('#requestNick').on('click', function(e) {
        socket.emit('requestNick', $('#nick').val());
        $('#nick').val('');
        return false;        
    });

    $('#joinRoom').on('click', function(e) {
        socket.emit('joinRoom', $('#room').val());
        $('#room').val('');
        return false;
    });

    $('#leaveRoom').on('click', function(e) {
        socket.emit('leaveRoom');
    });

    window.onbeforeunload = function () {
        socket.emit('leaveRoom');
    };


});

