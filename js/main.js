'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;

var pcConfig = {
  'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

/////////////////////////////////////////////

var room = 'foo';
// Could prompt for room name:
// room = prompt('Enter room name:');

var socket = io.connect();

if (room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

socket.on('created', function(room) {
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function(room) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', function(message) {
  console.log('Client received message:', message);
  if (message === 'got user media') {
    maybeStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////////////////////////////////////

class participant{
    constructor(id,vid,screen){
        this.id=id;
        this.vid=vid;
        this.screen=screen;
    }
}

var mainVideo = document.querySelector('#mainVideo');
var uservid = document.querySelector('#uservid');
var userscreen = document.querySelector('#userscreen');
var videos = document.getElementsByClassName("listelement");
var participants = new Map();
var count=1;
var customattr='data-participant';

navigator.mediaDevices.getUserMedia({
  audio: true,
  video: true
})
.then(gotStream)
.catch(function(e) {
  alert('getUserMedia() error: ' + e.name);
});

function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  mainVideo.srcObject = stream;
  uservid.srcObject = stream;
  let temp = new participant('localuser',uservid,userscreen);
  participants.set('localuser',temp);
  sendMessage('got user media');
  if (isInitiator) {
    maybeStart();
  }
}

var constraints = {
  video: true,
  audio: true
};

console.log('Getting user media with constraints', constraints);

if (location.hostname !== 'localhost') {
  requestTurn(
    'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
  );
}

function maybeStart() {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

window.onbeforeunload = function() {
  sendMessage('bye');
};

/////////////////////////////////////////////////////////

function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(null);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function requestTurn(turnURL) {
  var turnExists = false;
  for (var i in pcConfig.iceServers) {
    if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turnURL);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pcConfig.iceServers.push({
          'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turnURL, true);
    xhr.send();
  }
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  let elementid = 'user'+count;
  let newvidelement=document.createElement('video');
  let viddiv=document.createElement('div');
  viddiv.class='listelement';
  newvidelement.class='camvideo';
  newvidelement.id=elementid+'vid';
  newvidelement.customattr=elementid;
  newvidelement.onclick='change_mainvideo(this.class,this.data-participant)';
  newvidelement.autoplay = true;
  newvidelement.srcObject = remoteStream;
  viddiv.appendChild(newvidelement);
  document.getElementById('videolist').appendChild(viddiv);
  let newscreenelement=document.createElement('video');
  let screendiv=document.createElement('div');
  screendiv.class='listelement';
  newscreenelement.class='screenvideo';
  newscreenelement.id=elementid+'screen';
  newscreenelement.customattr=elementid;
  newscreenelement.onclick='change_mainvideo(this.class,this.data-participant)';
  newscreenelement.autoplay = true;
  newscreenelement.muted = true;
  screendiv.appendChild(newscreenelement);
  document.getElementById('videolist').appendChild(screendiv);
  let temp = new participant(elementid,newvidelement,newscreenelement);
  participants.set(elementid,temp);
  count++;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

//Audio toggle function
function audiotoggle() {
  var audioButton = document.getElementById("audioButton");
  if (audioButton.value=="audioOn")
  {
      audioButton.value="audioOff";
      audioButton.innerHTML="Unmute";
      //localAudio.srcObject = null;
      localStream.getAudioTracks()[0].enabled = false;
      
  }
  else
  {
      audioButton.value="audioOn";
      audioButton.innerHTML="Mute";
      //localAudio.srcObject = localStream;
      localStream.getAudioTracks()[0].enabled = true;
  }
}  

//Video toggle function
function videotoggle() {
  var videoButton = document.getElementById("videoButton");
  if (videoButton.value=="videoOn")
  {
      videoButton.value="videoOff";
      videoButton.innerHTML="Turn on video";
      //localAudio.srcObject = null;
      localStream.getVideoTracks()[0].enabled = false;
      
  }
  else
  {
      videoButton.value="videoOn";
      videoButton.innerHTML="Turn off video";
      //localAudio.srcObject = localStream;
      localStream.getVideoTracks()[0].enabled = true;
  }
}   

//Function to swap primary video
function change_mainvideo(vidclass,vidId)
{
    let temp = participants.get(vidId);
    if (vidclass=='camvideo')
    mainVideo.srcObject=temp.vid.srcObject;
    else
    mainVideo.srcObject=temp.screen.srcObject;
}
function stop() {
  isStarted = false;
  pc.close();
  pc = null;
}
