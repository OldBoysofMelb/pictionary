
document.addEventListener("DOMContentLoaded", function(event) {
	var canvas = document.getElementById("canvas");
	var ctx = canvas.getContext("2d");

	ctx.fillStyle = "green";
	ctx.fillRect(10, 10, 1000, 1000);

	// Create the yellow face
	ctx.strokeStyle = "#000000";
	ctx.fillStyle = "yellow";
	ctx.beginPath();
	ctx.arc(100,100,50,0,Math.PI*2,true);
	ctx.closePath();
	ctx.stroke();
	ctx.fill();


	var mouse = {x: 0, y: 0};
	 
	canvas.addEventListener('mousemove', function(e) {
	  mouse.x = e.pageX - this.offsetLeft;
	  mouse.y = e.pageY - this.offsetTop;
	}, false);

	ctx.lineWidth = 3;
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	ctx.strokeStyle = '#00CC99';
	 
	canvas.addEventListener('mousedown', function(e) {
	    ctx.beginPath();
	    ctx.moveTo(mouse.x, mouse.y);
	 
	    canvas.addEventListener('mousemove', onPaint, false);
	}, false);
	 
	canvas.addEventListener('mouseup', function() {
	    canvas.removeEventListener('mousemove', onPaint, false);
	}, false);
	 
	var onPaint = function() {
	    ctx.lineTo(mouse.x, mouse.y);
	    ctx.stroke();
	};
});