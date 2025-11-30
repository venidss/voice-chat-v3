import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import Peer from 'peerjs';

const App = () => {
    const [status, setStatus] = useState('initializing'); // initializing, idle, searching, connected
    const [myPeerId, setMyPeerId] = useState(null);
    const [logs, setLogs] = useState([]);
    const [micLevel, setMicLevel] = useState(0);
    const [devices, setDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState('');

    const socketRef = useRef();
    const peerRef = useRef();
    const localStreamRef = useRef();
    const remoteAudioRef = useRef();

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
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined }
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
        // 1. Setup Socket (for matching)
        // Use env var for production, fallback to localhost for dev
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3003';
        console.log('Connecting to server:', SERVER_URL);

        socketRef.current = io(SERVER_URL);
        socketRef.current.on('connect', () => addLog('Socket Connected'));

        // 2. Setup PeerJS (for audio)
        const peer = new Peer();
        peerRef.current = peer;

        peer.on('open', (id) => {
            addLog(`My Peer ID: ${id}`);
            setMyPeerId(id);
            setStatus('idle');
        });

        peer.on('call', (call) => {
            addLog('Incoming Call...');
            getLocalStream().then((stream) => {
                call.answer(stream); // Answer the call
                addLog('Answered Call');

                call.on('stream', (remoteStream) => {
                    addLog('Received Audio Stream');
                    if (remoteAudioRef.current) {
                        remoteAudioRef.current.srcObject = remoteStream;
                        remoteAudioRef.current.play().catch(e => alert('Click Force Play!'));
                    }
                    setStatus('connected');
                });
            });
        });

        peer.on('error', (err) => addLog(`Peer Error: ${err.type}`));

        // 3. Handle Socket Matching
        socketRef.current.on('match_found', ({ role, partnerPeerId }) => {
            addLog(`Match Found! Role: ${role}`);

            if (role === 'initiator') {
                addLog(`Calling Partner: ${partnerPeerId}`);
                getLocalStream().then((stream) => {
                    const call = peerRef.current.call(partnerPeerId, stream);

                    call.on('stream', (remoteStream) => {
                        addLog('Received Audio Stream');
                        if (remoteAudioRef.current) {
                            remoteAudioRef.current.srcObject = remoteStream;
                            remoteAudioRef.current.play().catch(e => alert('Click Force Play!'));
                        }
                        setStatus('connected');
                    });
                });
            } else {
                addLog('Waiting for incoming call...');
            }
        });

        return () => {
            socketRef.current?.disconnect();
            peerRef.current?.destroy();
        };
    }, [selectedDeviceId]);

    const startSearch = () => {
        if (!myPeerId) return alert('PeerJS not ready yet');
        setStatus('searching');
        socketRef.current.emit('find_partner', myPeerId);
        addLog('Searching for partner...');
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
                    <div className="relative">
                        {/* Status Ring Animation */}
                        {status === 'searching' && (
                            <div className="absolute inset-0 rounded-full bg-pink-500/20 animate-ping"></div>
                        )}

                        <div className={`w-32 h-32 rounded-full flex items-center justify-center text-5xl shadow-2xl transition-all duration-500 ${status === 'connected' ? 'bg-gradient-to-br from-green-400 to-emerald-600 scale-110' :
                                status === 'searching' ? 'bg-gradient-to-br from-yellow-400 to-orange-500' :
                                    'bg-gradient-to-br from-gray-700 to-gray-800'
                            }`}>
                            {status === 'connected' ? '🎙️' : status === 'searching' ? '🔍' : '👋'}
                        </div>
                    </div>

                    {status === 'idle' && (
                        <button
                            onClick={startSearch}
                            className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl font-bold text-lg shadow-lg shadow-pink-500/20 hover:shadow-pink-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            Find a Partner
                        </button>
                    )}

                    {status === 'searching' && (
                        <p className="text-gray-400 animate-pulse">Looking for someone...</p>
                    )}

                    {status === 'connected' && (
                        <div className="w-full space-y-3">
                            <button
                                onClick={() => remoteAudioRef.current?.play()}
                                className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                            >
                                <span>🔊</span> Force Play Audio
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
