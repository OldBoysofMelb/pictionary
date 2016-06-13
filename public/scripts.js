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
	};

	function clear() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
	}

	var socket = io('http://localhost:4000');

	socket.on('draw', function(data) {
		return draw(data.x, data.y, data.type);
	});
	socket.on('clear', function() {
		clear();
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
	})
});

