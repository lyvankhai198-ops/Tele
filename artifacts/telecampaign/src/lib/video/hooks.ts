import { useState, useEffect } from 'react';

declare global {
  interface Window {
    startRecording?: () => void;
    stopRecording?: () => void;
  }
}

export function useVideoPlayer({ durations, loop = true }: { durations: Record<string, number>, loop?: boolean }) {
  const [currentScene, setCurrentScene] = useState(0);
  const keys = Object.keys(durations);

  useEffect(() => {
    // Required by video-js skill for recording/export
    window.startRecording?.();
    
    let isMounted = true;
    let currentIdx = 0;
    
    function nextScene() {
      if (!isMounted) return;
      const currentDuration = durations[keys[currentIdx]];
      
      setTimeout(() => {
        if (!isMounted) return;
        if (currentIdx === keys.length - 1) {
          // Finish pass
          window.stopRecording?.();
          if (loop) {
            currentIdx = 0;
            setCurrentScene(0);
            nextScene();
          }
        } else {
          currentIdx++;
          setCurrentScene(currentIdx);
          nextScene();
        }
      }, currentDuration);
    }
    
    nextScene();

    return () => {
      isMounted = false;
    };
  }, [JSON.stringify(durations), loop]);

  return { currentScene, currentSceneKey: keys[currentScene] };
}
