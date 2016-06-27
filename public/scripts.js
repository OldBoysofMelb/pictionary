"use strict";

document.addEventListener("DOMContentLoaded", function(event) {
    var canvas = document.getElementById("canvas");
    var ctx = canvas.getContext("2d");

    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = $("select option:selected")[0].value;

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

    function showMessage(message) {
        $('#messages').append($('<div>').text(message));
        $('#messages').scrollTop($('#messages')[0].scrollHeight);
    }

    var socket = io('http://localhost:4000');

    var strokes = {};
    var currentStroke = 0;

    var messages = {};
    var currentMessage = 0;


    socket.emit('getCurrentStroke');
    socket.emit('getCurrentMessage');

    function requestMissingStrokes() {
        var keys = Object.getOwnPropertyNames(strokes).map(Number);

        if (keys[0] != 0) {
            keys.unshift(-1);
        }

        if (keys[keys.length - 1] != currentStroke) {
            keys.push(currentStroke + 1);
        }

        for (var i = 0; i < keys.length - 1; i++) {
            if (keys[i+1] - keys[i] == 2) {
                socket.emit('getStroke', keys[i] + 1);
            } else if (keys[i+1] - keys[i] > 2) {
                socket.emit('getStrokes', {
                    start: keys[i] + 1,
                    end: keys[i+1]
                });
            }
        }
    }

    function requestMissingMessages() {
        var keys = Object.getOwnPropertyNames(messages).map(Number);

        if (keys[0] != 0) {
            keys.unshift(-1);
        }

        if (keys[keys.length - 1] != currentMessage) {
            keys.push(currentMessage + 1);
        }

        for (var i = 0; i < keys.length - 1; i++) {
            if (keys[i+1] - keys[i] == 2) {
                socket.emit('getMessage', keys[i] + 1);
            } else if (keys[i+1] - keys[i] > 2) {
                socket.emit('getMessages', {
                    start: keys[i] + 1,
                    end: keys[i+1]
                });
            }
        }
    }

    socket.on('currentStroke', function (data) {
        currentStroke = data;
        window.console.log(currentStroke);

        if (strokes.length != currentStroke) {
            requestMissingStrokes();
        }
    });

    socket.on('currentMessage', function (data) {
        currentMessage = data;
        window.console.log(currentMessage);

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
            showMessage(data[i].data);
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
        messages[data.id] = data.data;
        showMessage(data.data);
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
});

