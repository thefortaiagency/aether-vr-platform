import { useState, useRef, useEffect } from 'react';
import { Button } from './components/ui/button';
import {
  Video,
  Mic,
  MicOff,
  VideoOff,
  Radio,
  Camera,
} from 'lucide-react';
import VRScene from './components/vr/VRScene';
import VRButton from './components/vr/VRButton';

function VRTraining() {
  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const roomName = urlParams.get('room') || undefined;
  const userName = urlParams.get('user') || 'Wrestler';

  const [showCoach, setShowCoach] = useState(true);
  const [showTechnique, setShowTechnique] = useState(true); // Enable technique videos by default
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [recording, setRecording] = useState(false);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | undefined>('/trainingmode.png');
  const [panoramaReady, setPanoramaReady] = useState(false);
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [screenshotStatus, setScreenshotStatus] = useState('');
  const [vrActive, setVRActive] = useState(false);
  const [generatingBackground, setGeneratingBackground] = useState(false);

  // Ref to access the VR scene container
  const sceneContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPanoramaReady(false);
  }, [backgroundImageUrl]);

  const generateBackground = async () => {
    setGeneratingBackground(true);

    try {
      const response = await fetch('/api/generate-vr-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.success && data.imageUrl) {
        setBackgroundImageUrl(data.imageUrl);
        console.log('✅ Background generated:', data.imageUrl);
      } else {
        console.error('❌ Failed to generate background:', data.error);
      }
    } catch (error) {
      console.error('❌ Error generating background:', error);
    } finally {
      setGeneratingBackground(false);
    }
  };

  const takeScreenshot = async () => {
    try {
      console.log('📸 Taking screenshot...');

      // Flash effect
      setScreenshotFlash(true);
      setTimeout(() => setScreenshotFlash(false), 200);

      // Wait a frame for render to complete
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Find the canvas element in the scene
      const canvas = sceneContainerRef.current?.querySelector('canvas') as HTMLCanvasElement;

      if (!canvas) {
        console.error('❌ No canvas found for screenshot');
        setScreenshotStatus('❌ No canvas found');
        setTimeout(() => setScreenshotStatus(''), 3000);
        return;
      }

      console.log('📸 Canvas found:', canvas.width, 'x', canvas.height);

      // Convert canvas to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          console.error('❌ Failed to create screenshot blob');
          return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `vr-training-${timestamp}.png`;

        // Download locally first
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);

        console.log('✅ Screenshot saved locally:', filename);

        // Send via text to coach
        try {
          console.log('📲 Sending screenshot via text...');

          const formData = new FormData();
          formData.append('to', '2604527615'); // Coach's phone number
          formData.append('message', `📸 VR Training Screenshot from ${userName || 'Wrestler'}`);
          formData.append('image', blob, filename);

          const response = await fetch('/api/twilio/send-mms', {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();

          if (data.success) {
            console.log('✅ Screenshot texted to coach:', data.messageSid);
            setScreenshotStatus('✅ Screenshot sent to coach!');
            setTimeout(() => setScreenshotStatus(''), 3000);
          } else {
            console.error('❌ Failed to text screenshot:', data.error);
            setScreenshotStatus('⚠️ Screenshot saved locally (text failed)');
            setTimeout(() => setScreenshotStatus(''), 3000);
          }
        } catch (smsError) {
          console.error('❌ SMS error:', smsError);
          setScreenshotStatus('⚠️ Screenshot saved locally (text failed)');
          setTimeout(() => setScreenshotStatus(''), 3000);
        }

      }, 'image/png');

    } catch (error) {
      console.error('❌ Screenshot error:', error);
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Full-screen background image */}
      {backgroundImageUrl && !panoramaReady && (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${backgroundImageUrl})`,
            filter: 'brightness(0.9)'
          }}
        />
      )}

      {/* Full-screen VR Scene with transparent background */}
      <div ref={sceneContainerRef} className="absolute inset-0">
        <VRScene
          activeExercise="stance"
          showCoach={showCoach}
          videoEnabled={showTechnique}
          onVRStart={() => setVRActive(true)}
          onVREnd={() => setVRActive(false)}
          backgroundImageUrl={backgroundImageUrl}
          onBackgroundReady={setPanoramaReady}
          roomName={roomName}
          userName={userName}
          onScreenshot={takeScreenshot}
        />
      </div>

      {/* Screenshot Flash Effect */}
      {screenshotFlash && (
        <div className="absolute inset-0 bg-white pointer-events-none z-50" />
      )}

      {/* VR Button - Enter VR mode */}
      <div className="absolute top-6 right-6 z-50">
        <VRButton />
      </div>

      {/* Controls - Bottom Center */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-black/70 backdrop-blur-md px-6 py-4 rounded-full border-2 border-white/50 shadow-2xl">
        {/* Mic Toggle */}
        <Button
          onClick={() => setIsMuted(!isMuted)}
          size="lg"
          variant={isMuted ? "destructive" : "default"}
          className="rounded-full w-12 h-12 p-0"
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </Button>

        {/* Video Toggle */}
        <Button
          onClick={() => setIsVideoOn(!isVideoOn)}
          size="lg"
          variant={!isVideoOn ? "destructive" : "default"}
          className="rounded-full w-12 h-12 p-0"
        >
          {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </Button>

        {/* Screenshot Button */}
        <Button
          onClick={takeScreenshot}
          size="lg"
          variant="default"
          className="rounded-full w-12 h-12 p-0 bg-purple-600 hover:bg-purple-700"
          title="Take Screenshot"
        >
          <Camera className="w-5 h-5" />
        </Button>

        {/* Toggle Coach */}
        <Button
          onClick={() => setShowCoach(!showCoach)}
          size="lg"
          variant={showCoach ? "default" : "outline"}
          className="rounded-full px-6"
        >
          {showCoach ? 'Hide Coach' : 'Show Coach'}
        </Button>

        {/* Toggle Technique Video */}
        <Button
          onClick={() => setShowTechnique(!showTechnique)}
          size="lg"
          variant={showTechnique ? "default" : "outline"}
          className="rounded-full px-6"
        >
          {showTechnique ? 'Hide Video' : 'Show Video'}
        </Button>

        {/* Record Button */}
        <Button
          onClick={() => setRecording(!recording)}
          size="lg"
          variant={recording ? "destructive" : "default"}
          className="px-6"
        >
          <Radio className={`w-5 h-5 mr-2 ${recording ? 'animate-pulse' : ''}`} />
          {recording ? 'Stop' : 'Record'}
        </Button>
      </div>

      {/* Room Connection Indicator - Top Left */}
      {roomName && (
        <div className="absolute top-6 left-6 z-50 flex flex-col gap-2">
          <div className="bg-green-500/20 backdrop-blur-md border border-green-500/30 px-4 py-2 rounded-full flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-500 font-medium text-sm">Connected to: {roomName}</span>
          </div>

          {/* Mobile Camera Link */}
          <a
            href={`/mobile-camera?room=${roomName}`}
            target="_blank"
            className="bg-blue-500/20 backdrop-blur-md border border-blue-500/30 px-4 py-2 rounded-full flex items-center gap-2 hover:bg-blue-500/30 transition-colors"
          >
            <Video className="w-4 h-4 text-blue-400" />
            <span className="text-blue-400 font-medium text-sm">📱 Open Phone Camera</span>
          </a>
        </div>
      )}

      {/* Recording Indicator - Top Center */}
      {recording && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-red-500/20 backdrop-blur-md border border-red-500/30 px-4 py-2 rounded-full flex items-center gap-2 z-50">
          <Radio className="w-4 h-4 text-red-500 animate-pulse" />
          <span className="text-red-500 font-medium text-sm">RECORDING</span>
        </div>
      )}

      {/* Screenshot Status - Top Center */}
      {screenshotStatus && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-purple-500/20 backdrop-blur-md border border-purple-500/30 px-4 py-2 rounded-full flex items-center gap-2 z-50">
          <Camera className="w-4 h-4 text-purple-400" />
          <span className="text-purple-400 font-medium text-sm">{screenshotStatus}</span>
        </div>
      )}
    </div>
  );
}

export default VRTraining;
