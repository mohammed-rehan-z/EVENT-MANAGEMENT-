"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Html5Qrcode } from "html5-qrcode";
import {
  fetchTeamByQR,
  commitTeamCheckIn,
  generateAndSendVenueOtpAction,
  verifyVenueOtpAction,
} from "@/app/actions/qrActions";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  Users,
  ShieldCheck,
  Search,
  ArrowLeft,
  XCircle,
  Clock,
  Sparkles,
  KeyRound,
  RotateCcw,
  Mail,
  ShieldAlert,
  ArrowRight,
  ChevronRight,
  Flashlight,
  Volume2,
  VolumeX,
  Lock,
  Smartphone,
  Check,
  Copy,
  Zap,
} from "lucide-react";

type ScanViewState = "SCAN" | "VERIFY" | "SUCCESS" | "FAILED";

// Sound synthesizer using Web Audio API (no external sound assets required)
function playFeedbackSound(type: "SUCCESS" | "ERROR") {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "SUCCESS") {
      // Pleasant high double chime (880Hz -> 1320Hz)
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else {
      // Low dual warning buzzer (220Hz -> 180Hz)
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(180, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {
    // Audio context may require initial user gesture
  }
}

function triggerHaptic(type: "SUCCESS" | "ERROR") {
  if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
    try {
      if (type === "SUCCESS") {
        navigator.vibrate([100, 50, 100]);
      } else {
        navigator.vibrate([350, 100, 350]);
      }
    } catch (e) {}
  }
}

export default function VolunteerScanPage() {
  return (
    <div className="min-h-screen bg-slate-950/2 text-slate-900 pb-24">
      <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading scanner...</div>}>
        <ScannerContent />
      </Suspense>
    </div>
  );
}

function ScannerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialToken = searchParams.get("token") || "";

  const [viewState, setViewState] = useState<ScanViewState>("SCAN");
  const [activeTab, setActiveTab] = useState<"CAMERA" | "OTP_DIRECT">("CAMERA");
  const [isScanning, setIsScanning] = useState(false);
  const [manualToken, setManualToken] = useState(initialToken);
  const [scannedTeam, setScannedTeam] = useState<any | null>(null);

  // Failure state tracking
  const [failureReason, setFailureReason] = useState("");
  const [failedToken, setFailedToken] = useState("");
  const [isDuplicateAlert, setIsDuplicateAlert] = useState(false);
  const [isExpiredAlert, setIsExpiredAlert] = useState(false);

  // Success state tracking
  const [admittedDetails, setAdmittedDetails] = useState<{
    teamName: string;
    captainName: string;
    captainEmail: string;
    membersCount: number;
    admittedAt: string;
    method: string;
    token: string;
  } | null>(null);

  // Mobile Hardware Controls
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [torchOn, setTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // OTP Verification Feature State
  const [requireOtp, setRequireOtp] = useState(true);
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState("");
  const [simulatedOtpNotice, setSimulatedOtpNotice] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState<number>(600); // 10 minutes in seconds
  const [otpAttemptsLeft, setOtpAttemptsLeft] = useState<number>(4);
  const [isOtpLocked, setIsOtpLocked] = useState(false);

  // Physical ID verification checkbox
  const [physicalIdChecked, setPhysicalIdChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentCheckIns, setRecentCheckIns] = useState<string[]>([]);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Enumerate cameras on mobile devices
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back/environment camera on mobile
          const backCam = devices.find((d) => d.label.toLowerCase().includes("back") || d.label.toLowerCase().includes("environment"));
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // OTP Countdown Timer
  useEffect(() => {
    let timer: any;
    if (otpSent && otpCountdown > 0) {
      timer = setInterval(() => {
        setOtpCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [otpSent, otpCountdown]);

  // Automatically process initialToken if provided
  useEffect(() => {
    if (initialToken) {
      handleLookupToken(initialToken);
    }
  }, [initialToken]);

  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const startScanner = async () => {
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("reader");
      }

      setIsScanning(true);
      const cameraIdOrConfig = selectedCameraId ? { deviceId: { exact: selectedCameraId } } : { facingMode: "environment" };

      await scannerRef.current.start(
        cameraIdOrConfig,
        { fps: 12, qrbox: { width: 260, height: 260 } },
        async (decodedText) => {
          if (viewState === "SCAN") {
            handleLookupToken(decodedText);
            if (scannerRef.current?.isScanning) {
              await scannerRef.current.stop().catch(() => {});
            }
            setIsScanning(false);
          }
        },
        () => {}
      );
    } catch (err: any) {
      toast.error("Camera access failed or permission denied. You can use direct token input below.");
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop().catch(() => {});
    }
    setIsScanning(false);
    setTorchOn(false);
  };

  const toggleTorch = async () => {
    try {
      if (scannerRef.current && isScanning) {
        const nextState = !torchOn;
        await scannerRef.current.applyVideoConstraints({
          advanced: [{ torch: nextState } as any],
        });
        setTorchOn(nextState);
        toast.info(nextState ? "Flashlight turned on" : "Flashlight turned off");
      }
    } catch (e) {
      toast.error("Flashlight/torch is not supported on this device's camera.");
    }
  };

  // Look up QR token or team identifier
  const handleLookupToken = async (tokenToTest: string) => {
    const cleanToken = tokenToTest.trim();
    if (!cleanToken) {
      toast.error("Please enter a QR token or code.");
      return;
    }

    toast.loading("Verifying cryptographic QR pass & expiration...", { id: "verify-qr" });
    setPhysicalIdChecked(false);
    setOtpSent(false);
    setEnteredOtp("");
    setSimulatedOtpNotice(null);
    setIsDuplicateAlert(false);
    setIsExpiredAlert(false);

    try {
      const res = await fetchTeamByQR(cleanToken);
      toast.dismiss("verify-qr");

      if (res.success && res.team) {
        setScannedTeam(res.team);
        setViewState("VERIFY");
        if (soundEnabled) playFeedbackSound("SUCCESS");
        triggerHaptic("SUCCESS");
        toast.success(`Roster loaded for '${res.team.name}'`);
      } else if (res.alreadyCheckedIn && res.team) {
        setScannedTeam(res.team);
        setFailedToken(cleanToken);
        setIsDuplicateAlert(true);
        setFailureReason(
          `SINGLE-USE SECURITY VIOLATION: Team '${res.team.name}' was already checked in. Re-entry with the same QR pass is prohibited.`
        );
        setViewState("FAILED");
        if (soundEnabled) playFeedbackSound("ERROR");
        triggerHaptic("ERROR");
        toast.error("QR Code already consumed!");
      } else if (res.isExpired && res.team) {
        setScannedTeam(res.team);
        setFailedToken(cleanToken);
        setIsExpiredAlert(true);
        setFailureReason(res.message || "Pass has expired.");
        setViewState("FAILED");
        if (soundEnabled) playFeedbackSound("ERROR");
        triggerHaptic("ERROR");
        toast.error("Pass expired!");
      } else {
        setFailedToken(cleanToken);
        setFailureReason(res.message || "Invalid or unrecognized QR token. Pass not found in system.");
        setViewState("FAILED");
        if (soundEnabled) playFeedbackSound("ERROR");
        triggerHaptic("ERROR");
        toast.error("Verification failed: Pass not recognized.");
      }
    } catch (err: any) {
      toast.dismiss("verify-qr");
      setFailedToken(cleanToken);
      setFailureReason("Network or server connection error: " + err.message);
      setViewState("FAILED");
      if (soundEnabled) playFeedbackSound("ERROR");
      triggerHaptic("ERROR");
      toast.error("Verification connection error.");
    }
  };

  // Send On-Spot OTP to Captain's Email via Resend
  const handleSendOnSpotOtp = async () => {
    if (!scannedTeam) return;
    setOtpSending(true);
    toast.loading("Dispatching verification code to captain's inbox...", { id: "otp-send" });

    try {
      const res = await generateAndSendVenueOtpAction(scannedTeam.id, scannedTeam.event_id);
      toast.dismiss("otp-send");

      if (res.success) {
        setOtpSent(true);
        setOtpCountdown(600);
        setOtpAttemptsLeft(res.attemptsLeft ?? 4);
        setIsOtpLocked(false);
        toast.success(res.message);
        if (res.isSimulated && res.simulatedOtp) {
          setSimulatedOtpNotice(`Dev Mode Code: ${res.simulatedOtp}`);
        }
      } else {
        toast.error("Failed to send verification code: " + res.message);
      }
    } catch (err: any) {
      toast.dismiss("otp-send");
      toast.error("Error sending OTP: " + err.message);
    } finally {
      setOtpSending(false);
    }
  };

  // Confirm admission with OTP Verification against System Data Store
  const handleVerifyOtpAndAdmit = async () => {
    if (!scannedTeam) return;
    if (!enteredOtp || enteredOtp.trim().length === 0) {
      toast.error("Please enter the 6-digit verification code provided by the captain.");
      return;
    }

    setIsSubmitting(true);
    try {
      const volunteerId = "gate-authority-on-site";
      const res = await verifyVenueOtpAction(scannedTeam.id, enteredOtp.trim(), volunteerId);

      if (res.success && res.team) {
        const leader = res.team.participants.find((p: any) => p.is_leader) || res.team.participants[0];
        setAdmittedDetails({
          teamName: res.team.name,
          captainName: leader?.full_name || "Team Captain",
          captainEmail: leader?.email || "N/A",
          membersCount: res.team.participants?.length || 0,
          admittedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          method: "Single-Use QR Pass + 2FA System OTP Verified",
          token: res.team.qr_token,
        });

        setRecentCheckIns((prev) => [
          `${res.team?.name || scannedTeam.name} (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`,
          ...prev.slice(0, 4),
        ]);

        if (soundEnabled) playFeedbackSound("SUCCESS");
        triggerHaptic("SUCCESS");
        toast.success("Admission Granted! Single-use pass consumed.");
        setViewState("SUCCESS");
      } else {
        if (res.isLocked) {
          setIsOtpLocked(true);
        }
        if (res.attemptsLeft !== undefined) {
          setOtpAttemptsLeft(res.attemptsLeft);
        }
        if (soundEnabled) playFeedbackSound("ERROR");
        triggerHaptic("ERROR");
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error("Admission error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Direct Admission (Single-use QR certified)
  const handleDirectAdmit = async () => {
    if (!scannedTeam) return;

    setIsSubmitting(true);
    try {
      const volunteerId = "gate-authority-on-site";
      const result = await commitTeamCheckIn(scannedTeam.id, scannedTeam.event_id, volunteerId);

      if (result.success) {
        const leader = scannedTeam.participants.find((p: any) => p.is_leader) || scannedTeam.participants[0];
        setAdmittedDetails({
          teamName: scannedTeam.name,
          captainName: leader?.full_name || "Team Captain",
          captainEmail: leader?.email || "N/A",
          membersCount: scannedTeam.participants?.length || 0,
          admittedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          method: "Single-Use QR Pass Certified",
          token: scannedTeam.qr_token,
        });

        setRecentCheckIns((prev) => [
          `${scannedTeam.name} (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`,
          ...prev.slice(0, 4),
        ]);

        if (soundEnabled) playFeedbackSound("SUCCESS");
        triggerHaptic("SUCCESS");
        toast.success(`Team '${scannedTeam.name}' is admitted!`);
        setViewState("SUCCESS");
      } else {
        setFailedToken(scannedTeam.qr_token);
        setFailureReason(result.message || "Failed to commit check-in.");
        setIsDuplicateAlert(Boolean((result as any).alreadyCheckedIn));
        setIsExpiredAlert(Boolean((result as any).isExpired));
        if (soundEnabled) playFeedbackSound("ERROR");
        triggerHaptic("ERROR");
        setViewState("FAILED");
      }
    } catch (err: any) {
      setFailureReason("Admission exception: " + err.message);
      if (soundEnabled) playFeedbackSound("ERROR");
      triggerHaptic("ERROR");
      setViewState("FAILED");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset back to scanner
  const handleResetToScan = () => {
    setScannedTeam(null);
    setManualToken("");
    setFailureReason("");
    setFailedToken("");
    setEnteredOtp("");
    setOtpSent(false);
    setPhysicalIdChecked(false);
    setIsDuplicateAlert(false);
    setIsExpiredAlert(false);
    setViewState("SCAN");
  };

  return (
    <div className="flex flex-col items-center p-3 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-5 pt-3 font-sans text-slate-900">
      {/* Precision Top Authority Header */}
      <div className="w-full flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wider">
              Gate Authority
            </span>
            <span className="text-[11px] text-slate-500 font-medium">Single-Use Pass Check-In</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary shrink-0" />
            <span>Admission Gate</span>
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Mute audio cues" : "Enable audio cues"}
            className="h-9 w-9 p-0 text-slate-600"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </Button>

          <Button
            size="sm"
            onClick={() => router.push("/scan/teams")}
            className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold h-9 px-3 rounded-xl shadow-2xs shrink-0 flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5 text-primary" />
            <span>Teams Directory</span>
          </Button>
        </div>
      </div>

      {/* Tabs: Camera Scanner vs Direct Code / OTP Lookup */}
      {viewState === "SCAN" && (
        <div className="w-full grid grid-cols-2 p-1 bg-slate-200/70 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab("CAMERA")}
            className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === "CAMERA" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            QR Camera Scanner
          </button>
          <button
            onClick={() => setActiveTab("OTP_DIRECT")}
            className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === "OTP_DIRECT" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 text-primary" />
            Code & System OTP
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. SCAN VIEW: Camera Viewfinder or Direct Code Input                     */}
      {/* ========================================================================= */}
      {viewState === "SCAN" && activeTab === "CAMERA" && (
        <div className="w-full space-y-4 animate-in fade-in">
          {/* Mobile Camera Hardware Options */}
          {cameras.length > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-600 px-1">
              <span className="flex items-center gap-1 font-medium">
                <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                Camera Device:
              </span>
              <select
                value={selectedCameraId}
                onChange={(e) => {
                  setSelectedCameraId(e.target.value);
                  if (isScanning) {
                    stopScanner().then(() => startScanner());
                  }
                }}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label || `Camera ${c.id.slice(0, 5)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Camera Scanner Viewfinder */}
          <div className="w-full bg-slate-950 rounded-2xl border-2 border-primary/40 relative overflow-hidden shadow-lg flex flex-col items-center justify-center min-h-[300px]">
            <div id="reader" className="w-full max-w-sm" />

            {!isScanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-xs p-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/20 text-primary flex items-center justify-center mb-4 ring-4 ring-primary/10">
                  <Camera className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Live Camera Scanner</h3>
                <p className="text-xs text-slate-400 max-w-xs mb-4 leading-relaxed">
                  Point camera at the attendee's signed mobile QR pass or printed badge.
                </p>
                <Button
                  onClick={startScanner}
                  className="bg-primary hover:bg-primary/90 text-white font-semibold text-xs h-10 px-6 shadow-md"
                >
                  Start Camera Scanner
                </Button>
              </div>
            )}

            {isScanning && (
              <div className="absolute bottom-4 z-20 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={toggleTorch}
                  className={`border text-xs h-8 px-3 rounded-lg ${
                    torchOn ? "bg-amber-500 text-white border-amber-600" : "bg-slate-900/80 text-white border-slate-700"
                  }`}
                >
                  <Flashlight className="w-3.5 h-3.5 mr-1" />
                  {torchOn ? "Flashlight On" : "Flashlight"}
                </Button>

                <Button
                  size="sm"
                  onClick={stopScanner}
                  className="bg-slate-900/90 border border-slate-700 text-white hover:bg-slate-800 text-xs h-8 px-3 rounded-lg"
                >
                  Stop Camera
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Direct Code / OTP Tab */}
      {viewState === "SCAN" && (
        <div className="w-full space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-primary" />
              <span>Direct Token / Team Identifier Lookup</span>
            </h4>
            <p className="text-xs text-slate-500 mb-3.5 leading-relaxed">
              Enter or paste the team's QR Token, SECQR payload, or Team Name.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLookupToken(manualToken);
              }}
              className="flex gap-2"
            >
              <Input
                placeholder="e.g. token-cyber-knights-2026 or paste QR token..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="bg-slate-50 border-slate-200 text-slate-900 text-xs sm:text-sm h-10 font-mono rounded-xl flex-1"
              />
              <Button
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold h-10 px-5 rounded-xl shrink-0"
              >
                Verify Pass
              </Button>
            </form>
          </div>

          {/* Recent Check-Ins Log */}
          {recentCheckIns.length > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <h5 className="text-xs font-bold text-slate-600 mb-2">
                Recent Check-Ins this session:
              </h5>
              <div className="space-y-1.5">
                {recentCheckIns.map((ci, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{ci}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. VERIFY VIEW: Roster Display, Expiration, and OTP Matching             */}
      {/* ========================================================================= */}
      {viewState === "VERIFY" && scannedTeam && (
        <div className="w-full space-y-5 animate-in fade-in">
          {/* Header Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                ACTIVE PASS
              </span>
              <button onClick={handleResetToScan} className="text-xs text-slate-400 hover:text-slate-700 font-semibold">
                Cancel / Re-scan
              </button>
            </div>

            <h3 className="text-xl font-bold text-slate-900">{scannedTeam.name}</h3>
            {scannedTeam.category && (
              <span className="text-xs text-slate-500 font-medium">{scannedTeam.category}</span>
            )}

            {/* Expiration Badge */}
            {scannedTeam.qr_expires_at && (
              <div className="mt-2 text-xs flex items-center gap-1.5 text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  Expires: <strong>{new Date(scannedTeam.qr_expires_at).toLocaleString()}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Participants Roster */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Participant Roster ({scannedTeam.participants?.length || 0} Members)
            </h4>

            <div className="space-y-2">
              {scannedTeam.participants?.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      <span>{p.full_name}</span>
                      {p.is_leader && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                          Captain
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{p.email}</div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">{p.course || "Member"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dual-Factor System OTP Matching */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-primary" />
                  <span>2FA System OTP Matching</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Authenticate on-spot against data store via 6-digit code.
                </p>
              </div>

              <input
                type="checkbox"
                checked={requireOtp}
                onChange={(e) => setRequireOtp(e.target.checked)}
                className="w-4 h-4 text-primary rounded"
              />
            </div>

            {requireOtp && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                {!otpSent ? (
                  <Button
                    onClick={handleSendOnSpotOtp}
                    disabled={otpSending}
                    className="w-full bg-primary hover:bg-primary/90 text-white text-xs font-semibold h-10 rounded-xl gap-2"
                  >
                    <Mail className="w-4 h-4" />
                    {otpSending ? "Dispatching Code..." : "Send Verification Code to Captain Email"}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-emerald-700 font-medium">Code dispatched to captain's email.</span>
                      <span className="font-mono text-amber-700 font-bold">
                        Valid for {Math.floor(otpCountdown / 60)}:{String(otpCountdown % 60).padStart(2, "0")}
                      </span>
                    </div>

                    {simulatedOtpNotice && (
                      <div className="bg-emerald-50 text-emerald-800 text-xs p-2.5 rounded-lg border border-emerald-200 font-mono font-bold flex items-center justify-between">
                        <span>{simulatedOtpNotice}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const code = simulatedOtpNotice.split(": ")[1];
                            if (code) setEnteredOtp(code);
                          }}
                          className="h-6 text-[10px] text-emerald-900 bg-emerald-200/50"
                        >
                          Auto-fill
                        </Button>
                      </div>
                    )}

                    {isOtpLocked ? (
                      <div className="p-3 bg-rose-50 text-rose-800 border border-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2">
                        <Lock className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Security Lockout: Maximum attempts exceeded. Verification locked.</span>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-700">Enter 6-Digit Code:</label>
                          <Input
                            type="text"
                            maxLength={6}
                            placeholder="e.g. 849201"
                            value={enteredOtp}
                            onChange={(e) => setEnteredOtp(e.target.value)}
                            className="text-center font-mono text-lg tracking-widest bg-slate-50 h-12 rounded-xl font-bold"
                          />
                          <div className="text-[11px] text-slate-500 text-right">
                            Attempts remaining: <strong>{otpAttemptsLeft}</strong> / 4
                          </div>
                        </div>

                        <Button
                          onClick={handleVerifyOtpAndAdmit}
                          disabled={isSubmitting || enteredOtp.trim().length === 0}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-11 rounded-xl shadow-md gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {isSubmitting ? "Verifying..." : "Match Code & Commit Single-Use Check-In"}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {!requireOtp && (
              <div className="pt-2 border-t border-slate-100">
                <Button
                  onClick={handleDirectAdmit}
                  disabled={isSubmitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-11 rounded-xl shadow-md gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isSubmitting ? "Admitting..." : "Admit Team (Consume Single-Use QR)"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUCCESS VIEW: Single-Use Pass Consumed                                 */}
      {/* ========================================================================= */}
      {viewState === "SUCCESS" && admittedDetails && (
        <div className="w-full bg-white rounded-2xl p-6 border border-emerald-300 shadow-md text-center space-y-4 animate-in zoom-in-95">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto ring-8 ring-emerald-50">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
              Single-Use Pass Consumed
            </span>
            <h3 className="text-2xl font-bold text-slate-900 mt-2">{admittedDetails.teamName}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Captain: {admittedDetails.captainName}</p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Admitted At:</span>
              <span className="font-mono font-bold text-slate-800">{admittedDetails.admittedAt}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Total Members:</span>
              <span className="font-bold text-slate-800">{admittedDetails.membersCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Verification Method:</span>
              <span className="text-slate-800">{admittedDetails.method}</span>
            </div>
          </div>

          <Button
            onClick={handleResetToScan}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-11 rounded-xl gap-2"
          >
            <Camera className="w-4 h-4" />
            Scan Next Attendee
          </Button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. FAILED VIEW: Duplicate, Expired, or Tampered Warning                  */}
      {/* ========================================================================= */}
      {viewState === "FAILED" && (
        <div className="w-full bg-white rounded-2xl p-6 border border-rose-300 shadow-md text-center space-y-4 animate-in zoom-in-95">
          <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto ring-8 ring-rose-50">
            <ShieldAlert className="w-10 h-10" />
          </div>

          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full">
              {isDuplicateAlert ? "Single-Use Violation" : isExpiredAlert ? "Expired QR Pass" : "Security Alert"}
            </span>
            <h3 className="text-xl font-bold text-slate-900 mt-2">Admission Denied</h3>
            <p className="text-xs text-rose-700 mt-1 max-w-sm mx-auto font-medium">{failureReason}</p>
          </div>

          {scannedTeam && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Team:</span>
                <span className="font-bold text-slate-800">{scannedTeam.name}</span>
              </div>
              {scannedTeam.checked_in_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">First Admitted:</span>
                  <span className="font-mono text-slate-800">{new Date(scannedTeam.checked_in_at).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleResetToScan}
              className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-11 rounded-xl gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Try Another Pass
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
