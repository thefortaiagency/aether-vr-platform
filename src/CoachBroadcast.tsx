import { useState, useRef, useEffect } from 'react';
import { Button } from './components/ui/button';
import { Video, VideoOff, Mic, MicOff, LogOut } from 'lucide-react';

function CoachBroadcast() {
  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const roomName = urlParams.get('room') || 'wrestling-test-room';
  const coachName = urlParams.get('coach') || 'Coach';

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<any>(null);
  const localTrackRef = useRef<any>(null);

  const connectToRoom = async () => {
    try {
      setIsConnecting(true);
      setError(null);
      console.log('🎥 [COACH] Connecting to room:', roomName);

      // Dynamic import of Twilio Video
      const Video = await import('twilio-video');

      // Get token from API
      const response = await fetch('/api/twilio/video-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: roomName,
          identity: `${coachName}-coach-${Date.now()}`
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to get token: ${response.status}`);
      }

      const { token } = await response.json();
      console.log('✅ [COACH] Got token, connecting...');

      // Connect to room with video and audio
      const room = await Video.connect(token, {
        name: roomName,
        audio: true,
        video: { width: 1280, height: 720 }
      });

      roomRef.current = room;
      console.log('✅ [COACH] Connected to room:', room.name);

      // Display local video
      room.localParticipant.videoTracks.forEach((publication: any) => {
        if (publication.track && videoRef.current) {
          videoRef.current.srcObject = new MediaStream([publication.track.mediaStreamTrack]);
          localTrackRef.current = publication.track;
        }
      });

      // Track participants
      setParticipantCount(room.participants.size);

      room.on('participantConnected', (participant: any) => {
        console.log('👤 [COACH] Participant joined:', participant.identity);
        setParticipantCount(room.participants.size);
      });

      room.on('participantDisconnected', (participant: any) => {
        console.log('👋 [COACH] Participant left:', participant.identity);
        setParticipantCount(room.participants.size);
      });

      setIsConnected(true);
      setIsConnecting(false);
    } catch (err: any) {
      console.error('❌ [COACH] Connection error:', err);
      setError(err.message || 'Failed to connect');
      setIsConnecting(false);
    }
  };

  const disconnectFromRoom = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
      setIsConnected(false);
      setParticipantCount(0);
      console.log('👋 [COACH] Disconnected from room');
    }
  };

  const toggleVideo = () => {
    if (localTrackRef.current) {
      if (isVideoOn) {
        localTrackRef.current.disable();
      } else {
        localTrackRef.current.enable();
      }
      setIsVideoOn(!isVideoOn);
    }
  };

  const toggleAudio = () => {
    if (roomRef.current) {
      roomRef.current.localParticipant.audioTracks.forEach((publication: any) => {
        if (publication.track) {
          if (isMuted) {
            publication.track.enable();
          } else {
            publication.track.disable();
          }
        }
      });
      setIsMuted(!isMuted);
    }
  };

  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">🎥 Coach Broadcast</h1>
          <p className="text-slate-300">Share your video with athletes in VR</p>
        </div>

        {/* Connection Info */}
        <div className="bg-slate-800/50 backdrop-blur rounded-lg p-6 mb-6 border border-slate-700">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-400">Room:</span>
              <span className="ml-2 font-mono text-cyan-400">{roomName}</span>
            </div>
            <div>
              <span className="text-slate-400">Coach:</span>
              <span className="ml-2 font-semibold">{coachName}</span>
            </div>
            <div>
              <span className="text-slate-400">Status:</span>
              <span className={`ml-2 font-semibold ${isConnected ? 'text-green-400' : 'text-slate-400'}`}>
                {isConnected ? '🟢 Connected' : '⚪ Disconnected'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Athletes:</span>
              <span className="ml-2 font-semibold text-blue-400">{participantCount}</span>
            </div>
          </div>
        </div>

        {/* Video Preview */}
        <div className="bg-slate-800 rounded-lg p-4 mb-6 border border-slate-700">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-auto rounded-lg bg-slate-900"
            style={{ aspectRatio: '16/9' }}
          />
          {!isConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 rounded-lg">
              <p className="text-slate-400 text-lg">Camera preview will appear here</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-4 justify-center mb-6">
          {!isConnected ? (
            <Button
              onClick={connectToRoom}
              disabled={isConnecting}
              size="lg"
              className="bg-green-600 hover:bg-green-700 text-white px-8"
            >
              {isConnecting ? '🔄 Connecting...' : '📡 Start Broadcasting'}
            </Button>
          ) : (
            <>
              <Button
                onClick={toggleVideo}
                size="lg"
                variant={isVideoOn ? 'default' : 'destructive'}
              >
                {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </Button>
              <Button
                onClick={toggleAudio}
                size="lg"
                variant={isMuted ? 'destructive' : 'default'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>
              <Button
                onClick={disconnectFromRoom}
                size="lg"
                variant="destructive"
                className="px-8"
              >
                <LogOut className="w-5 h-5 mr-2" />
                End Broadcast
              </Button>
            </>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-400">❌ Error: {error}</p>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-slate-800/30 backdrop-blur rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4">📝 Instructions</h2>
          <div className="space-y-3 text-sm text-slate-300">
            <div>
              <span className="font-semibold text-white">Coach URL:</span>
              <p className="font-mono text-xs bg-slate-900 p-2 rounded mt-1">
                {window.location.origin}/coach.html?room={roomName}&coach={coachName}
              </p>
            </div>
            <div>
              <span className="font-semibold text-white">Athlete URL (for VR):</span>
              <p className="font-mono text-xs bg-slate-900 p-2 rounded mt-1">
                {window.location.origin}/?room={roomName}&user=Athlete
              </p>
            </div>
            <div className="pt-2 border-t border-slate-700">
              <p>1. Coach: Click "Start Broadcasting" to share your video</p>
              <p>2. Athlete: Open the athlete URL on Quest 2 browser</p>
              <p>3. Athlete: Enter VR mode and see coach video on the right panel</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CoachBroadcast;
