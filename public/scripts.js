"use strict";

document.addEventListener("DOMContentLoaded", function(event) {
    var canvas = document.getElementById("canvas");
    var ctx = canvas.getContext("2d");

    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#222222';

    function draw(x, y, type) {
        if (type === "dragstart") {
            ctx.beginPath();
            return ctx.moveTo(x, y);
        } else if (type === "drag") {
            ctx.lineTo(x, y);
            return ctx.stroke();
        } else {
            return ctx.closePath();
        }
    }

    function clear() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    var socket = io('http://localhost:4000');

    var strokes = {};
    var current = 0;
    var last = 0;

    socket.emit('getCurrent');

    function requestMissing() {
        var keys = Object.getOwnPropertyNames(strokes).map(Number);

        if (keys[0] != 0) {
            keys.unshift(0);
        }

        if (keys[keys.length - 1] != current) {
            keys.push(current);
        }

        for (var i = 0; i < keys.length - 1; i++) {
            if (keys[i+1] - keys[i] == 2) {
                socket.emit('getStroke', keys[i] + j);
            } else if (keys[i+1] - keys[i] > 2) {
                socket.emit('getStrokes', {
                    start: keys[i] + 1,
                    end: keys[i+1]
                });
            }
        }
    }

    socket.on('current', function (data) {
        current = data;
        window.console.log(current);

        if (current > 0 && last + 1 != current) {
            requestMissing();
        }
    });

    socket.on('draw', function(data) {
        strokes[data.id] = data;

        return draw(data.x, data.y, data.type);
    });

    socket.on('drawStrokes', function(data) {
        for (var i in data) {
            strokes[data[i].id] = data[i];
            draw(data[i].x, data[i].y, data[i].type);
        }
    });

    socket.on('drawReceived', function(data) {
        strokes[data.id] = data.data;
    });

    socket.on('clear', function() {
        clear();
        strokes = {};
    });

    $('canvas').on('drag dragstart dragend', function(e) {
        var offset, type, x, y;
        type = e.handleObj.type;
        offset = $(this).offset();
        e.offsetX = e.pageX - offset.left;
        e.offsetY = e.pageY - offset.top;
        x = e.offsetX;
        y = e.offsetY;
        draw(x, y, type);
        socket.emit('drawClick', {
            x: x,
            y: y,
            type: type
        });
    });

    $('#clear').on('click', function(e) {
        clear();
        socket.emit('clear');
    });

    $('select').change(function(){
        ctx.strokeStyle = $("select option:selected")[0]["value"];
    });
});

