import React, { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';

const App = () => {
    const [status, setStatus] = useState('idle'); // idle, connecting, connected
    const [myPeerId, setMyPeerId] = useState(null);
    const [partnerIdInput, setPartnerIdInput] = useState('');
    const [logs, setLogs] = useState([]);
    const [micLevel, setMicLevel] = useState(0);
    const [devices, setDevices] = useState([]);

    // Fix: Use Ref to track selected device without re-triggering effects
    const [selectedDeviceId, setSelectedDeviceId] = useState('');
    const selectedDeviceIdRef = useRef('');

    // Update ref when state changes
    useEffect(() => {
        selectedDeviceIdRef.current = selectedDeviceId;
    }, [selectedDeviceId]);

    const peerRef = useRef();
    const localStreamRef = useRef();
    const remoteAudioRef = useRef();

    const currentCallRef = useRef(null);

    const addLog = (msg) => {
        console.log(msg);
        setLogs(prev => [...prev.slice(-4), msg]);
    };

    // Function to visualize mic level
    const monitorMic = (stream) => {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const update = () => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            setMicLevel(average);
            requestAnimationFrame(update);
        };
        update();
    };

    const endCall = () => {
        if (currentCallRef.current) {
            currentCallRef.current.close();
            currentCallRef.current = null;
        }
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = null;
        }
        setStatus('idle');
        addLog('Call Ended');
    };

    useEffect(() => {
        // List microphones
        navigator.mediaDevices.enumerateDevices().then(devs => {
            const audioInputs = devs.filter(d => d.kind === 'audioinput');
            setDevices(audioInputs);
            if (audioInputs.length > 0) {
                setSelectedDeviceId(audioInputs[0].deviceId);
            }
        });
    }, []);

    // Helper to get stream from selected device
    const getLocalStream = async () => {
        try {
            const deviceId = selectedDeviceIdRef.current; // Use Ref to get latest ID
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: deviceId ? { exact: deviceId } : undefined }
            });
            localStreamRef.current = stream;
            monitorMic(stream);
            return stream;
        } catch (err) {
            console.error('Mic Error:', err);
            alert(`Microphone Error: ${err.name}. Check permissions!`);
            throw err;
        }
    };

    useEffect(() => {
        // SECURITY CHECK: Phones require HTTPS for microphone!
        if (window.location.hostname !== 'localhost' && window.location.protocol === 'http:') {
            alert('Security Error: Microphones are BLOCKED on http:// (insecure). You must use https:// (like Vercel) or localhost.');
        }

        // 1. Setup PeerJS (for audio)
        const peer = new Peer();
        peerRef.current = peer;

        peer.on('open', (id) => {
            addLog(`My Peer ID: ${id}`);
            setMyPeerId(id);
        });

        peer.on('call', (call) => {
            addLog(`Incoming Call from ${call.peer}...`);
            const accept = confirm(`Incoming call from ${call.peer}. Accept?`);
            if (accept) {
                getLocalStream().then((stream) => {
                    call.answer(stream); // Answer the call
                    currentCallRef.current = call;
                    addLog('Answered Call');
                    setStatus('connected');

                    call.on('stream', (remoteStream) => {
                        addLog('Received Audio Stream');
                        if (remoteAudioRef.current) {
                            remoteAudioRef.current.srcObject = remoteStream;
                            remoteAudioRef.current.play().catch(e => alert('Click Force Play!'));
                        }
                    });

                    call.on('close', () => {
                        endCall();
                    });
                });
            }
        });

        peer.on('error', (err) => addLog(`Peer Error: ${err.type}`));

        return () => {
            peerRef.current?.destroy();
        };
    }, []); // Empty dependency array = Run once on mount

    const callPartner = () => {
        if (!partnerIdInput) return alert('Please enter a Partner ID');
        if (!myPeerId) return alert('PeerJS not ready yet');

        setStatus('connecting');
        addLog(`Calling ${partnerIdInput}...`);

        getLocalStream().then((stream) => {
            const call = peerRef.current.call(partnerIdInput, stream);
            currentCallRef.current = call;

            call.on('stream', (remoteStream) => {
                addLog('Received Audio Stream');
                if (remoteAudioRef.current) {
                    remoteAudioRef.current.srcObject = remoteStream;
                    remoteAudioRef.current.play().catch(e => alert('Click Force Play!'));
                }
                setStatus('connected');
            });

            call.on('close', () => {
                endCall();
            });

            call.on('error', (err) => {
                addLog(`Call Error: ${err}`);
                setStatus('idle');
            });
        });
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(myPeerId);
        alert('Copied ID to clipboard!');
    };

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900 via-gray-900 to-black text-white flex flex-col items-center justify-center p-4 font-sans selection:bg-pink-500 selection:text-white">

            {/* Main Card */}
            <div className="relative w-full max-w-lg bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-8">

                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 mb-2 tracking-tight">
                        Voice<span className="text-white">Chat</span>
                    </h1>
                    <div className="flex items-center justify-center gap-2 text-sm font-medium text-gray-400">
                        <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-gray-500'}`}></span>
                        <span className="uppercase tracking-widest">{status}</span>
                    </div>
                </div>

                {/* Mic Visualizer & Selector */}
                <div className="mb-8 space-y-4">
                    {/* Visualizer Bar */}
                    <div className="h-16 bg-black/40 rounded-2xl flex items-end justify-center gap-1 p-2 overflow-hidden border border-white/5">
                        {/* Simulate multiple bars based on the single volume level for a cool effect */}
                        {[...Array(20)].map((_, i) => (
                            <div
                                key={i}
                                className="w-1.5 bg-gradient-to-t from-pink-600 to-purple-500 rounded-t-full transition-all duration-75"
                                style={{
                                    height: `${Math.max(10, Math.min(100, micLevel * (1 + Math.sin(i)) * 2))}%`,
                                    opacity: 0.8
                                }}
                            ></div>
                        ))}
                    </div>

                    {/* Selector */}
                    <div className="relative">
                        <select
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-pink-500/50 appearance-none cursor-pointer hover:bg-white/5 transition-colors"
                            value={selectedDeviceId}
                            onChange={(e) => setSelectedDeviceId(e.target.value)}
                        >
                            {devices.map(device => (
                                <option key={device.deviceId} value={device.deviceId} className="bg-gray-900">
                                    {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                            ▼
                        </div>
                    </div>
                </div>

                {/* Action Area */}
                <div className="flex flex-col items-center gap-6">

                    {/* My ID Display */}
                    <div className="w-full bg-black/30 rounded-xl p-4 border border-white/5 flex items-center justify-between">
                        <div className="overflow-hidden">
                            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">My ID</p>
                            <p className="font-mono text-sm text-pink-400 truncate">{myPeerId || 'Generating...'}</p>
                        </div>
                        <button onClick={copyToClipboard} className="ml-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors" title="Copy ID">
                            📋
                        </button>
                    </div>

                    {status === 'idle' && (
                        <div className="w-full space-y-4">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Enter Partner ID"
                                    value={partnerIdInput}
                                    onChange={(e) => setPartnerIdInput(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-4 text-center font-mono text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all"
                                />
                            </div>
                            <button
                                onClick={callPartner}
                                className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl font-bold text-lg shadow-lg shadow-pink-500/20 hover:shadow-pink-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                                Call Partner
                            </button>
                        </div>
                    )}

                    {status === 'connecting' && (
                        <div className="text-center">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
                            <p className="text-gray-400 animate-pulse">Connecting...</p>
                        </div>
                    )}

                    {status === 'connected' && (
                        <div className="w-full space-y-3">
                            <button
                                onClick={() => remoteAudioRef.current?.play()}
                                className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                            >
                                <span>🔊</span> Force Play Audio
                            </button>
                            <button
                                onClick={endCall}
                                className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                            >
                                <span>❌</span> End Call
                            </button>
                            <p className="text-xs text-center text-gray-500">Connected via PeerJS • End-to-End Encrypted</p>
                        </div>
                    )}
                </div>

            </div>

            {/* Logs (Collapsible/Small) */}
            <div className="mt-8 w-full max-w-lg">
                <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/5 p-4 h-32 overflow-y-auto font-mono text-xs text-gray-400">
                    {logs.length === 0 && <span className="opacity-50">System ready...</span>}
                    {logs.map((log, i) => (
                        <div key={i} className="mb-1 border-l-2 border-pink-500/50 pl-2">
                            <span className="text-pink-500 mr-2">›</span>
                            {log}
                        </div>
                    ))}
                </div>
            </div>

            {/* Hidden Audio */}
            <audio ref={remoteAudioRef} autoPlay playsInline controls className="hidden" />
        </div>
    );
};

export default App;
