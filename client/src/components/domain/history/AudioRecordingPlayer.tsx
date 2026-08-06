import { useState, useRef } from "react";
import { Play, Pause, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl, getToken } from "@/lib/auth";

interface AudioRecordingPlayerProps {
  recordingUrl: string;
  compact?: boolean;
}

export const AudioRecordingPlayer = ({ recordingUrl, compact = false }: AudioRecordingPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const token = getToken();
  const fullUrl = recordingUrl.startsWith("http") || recordingUrl.startsWith("blob:") ? recordingUrl : apiUrl(recordingUrl);
  const authenticatedUrl = token
    ? fullUrl.includes("?") ? `${fullUrl}&apiKey=${token}` : `${fullUrl}?apiKey=${token}`
    : fullUrl;

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || !isFinite(secs) || isNaN(secs)) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1 max-w-[200px] sm:max-w-[240px] shadow-2xs">
        <audio
          ref={audioRef}
          src={authenticatedUrl}
          onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
          onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
          onEnded={() => setIsPlaying(false)}
        />

        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlay}
          className="h-6 w-6 rounded-full bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground shrink-0 transition-colors cursor-pointer shadow-2xs"
          title={isPlaying ? "Pausar" : "Reproduzir"}
        >
          {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
        </Button>

        <div className="flex flex-col justify-center min-w-0 flex-1">
          <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground font-semibold leading-none mb-1 gap-1">
            <span>{formatTime(currentTime)}</span>
            <span className="text-muted-foreground/40">/</span>
            <span>{formatTime(duration)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setCurrentTime(val);
              if (audioRef.current) audioRef.current.currentTime = val;
            }}
            className="audio-slider"
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          asChild
          className="h-5 w-5 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
          title="Baixar áudio"
        >
          <a href={authenticatedUrl} download>
            <Download className="h-3 w-3" />
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/80 p-2 shadow-2xs">
      <audio
        ref={audioRef}
        src={authenticatedUrl}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
        onEnded={() => setIsPlaying(false)}
      />

      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlay}
        className="h-7 w-7 rounded-full bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground shrink-0 transition-colors cursor-pointer shadow-2xs"
        title={isPlaying ? "Pausar" : "Reproduzir"}
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </Button>

      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
          <span className="truncate text-foreground/80">Gravação de Áudio</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            setCurrentTime(val);
            if (audioRef.current) audioRef.current.currentTime = val;
          }}
          className="audio-slider"
        />
      </div>

      <Button
        variant="ghost"
        size="icon"
        asChild
        className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
        title="Baixar áudio"
      >
        <a href={authenticatedUrl} download>
          <Download className="h-3.5 w-3.5" />
        </a>
      </Button>
    </div>
  );
};
