import React, { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { db } from './firebaseConfig';
import { ref, set, push, onValue, remove, onDisconnect, get, child } from "firebase/database";

const App = () => {
    const [status, setStatus] = useState('idle'); // idle, searching, connected
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
    const myQueueRef = useRef(null);

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
        // Remove from queue if we were searching
        if (myQueueRef.current) {
            remove(myQueueRef.current);
            myQueueRef.current = null;
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
        const peer = new Peer({
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' },
                    { urls: 'stun:stun.stunprotocol.org:3478' },
                    { urls: 'stun:stun.nextcloud.com:3478' },
                    { urls: 'stun:stun.voip.blackberry.com:3478' }
                ]
            }
        });
        peerRef.current = peer;

        peer.on('open', (id) => {
            addLog(`My Peer ID: ${id}`);
            setMyPeerId(id);
        });

        peer.on('call', (call) => {
            addLog(`Incoming Call from ${call.peer}...`);

            // If we are searching, we accept automatically (or we can ask)
            // For smoother UX, let's accept automatically if we are in 'searching' state
            // But to be safe, let's just accept.

            getLocalStream().then((stream) => {
                call.answer(stream); // Answer the call
                currentCallRef.current = call;
                addLog('Answered Call');
                setStatus('connected');

                // Monitor ICE Connection State
                call.peerConnection.oniceconnectionstatechange = () => {
                    const iceState = call.peerConnection.iceConnectionState;
                    addLog(`ICE State: ${iceState}`);
                    if (iceState === 'disconnected' || iceState === 'failed' || iceState === 'closed') {
                        setStatus('idle');
                        addLog('Connection lost (ICE)');
                        endCall();
                    }
                };

                // Remove myself from queue if I was waiting
                if (myQueueRef.current) {
                    remove(myQueueRef.current);
                    myQueueRef.current = null;
                }

                call.on('stream', (remoteStream) => {
                    addLog('Received Audio Stream');
                    if (remoteAudioRef.current) {
                        remoteAudioRef.current.srcObject = remoteStream;
                        remoteAudioRef.current.play().catch(e => alert('Click Force Play!'));
                    }
                });

                call.on('close', () => {
                    endCall();
                    alert('Partner ended the call');
                });
            });
        });

        peer.on('error', (err) => addLog(`Peer Error: ${err.type}`));

        // Handle tab close
        const handleBeforeUnload = () => {
            if (currentCallRef.current) {
                currentCallRef.current.close();
            }
            if (myQueueRef.current) {
                remove(myQueueRef.current);
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            peerRef.current?.destroy();
            if (myQueueRef.current) {
                remove(myQueueRef.current);
            }
        };
    }, []); // Empty dependency array = Run once on mount

    const findPartner = async () => {
        if (!myPeerId) return alert('PeerJS not ready yet');
        setStatus('searching');
        addLog('Looking for someone...');

        const queueRef = ref(db, 'queue');

        try {
            addLog('Checking Firebase queue...');
            // 1. Check if anyone is waiting
            const snapshot = await get(queueRef);
            let foundPartner = null;

            if (snapshot.exists()) {
                addLog(`Found ${snapshot.size} users in queue.`);
                snapshot.forEach((childSnapshot) => {
                    const user = childSnapshot.val();
                    // Don't match with self
                    if (user.peerId !== myPeerId) {
                        foundPartner = { key: childSnapshot.key, ...user };
                        return true; // Break loop
                    }
                });
            } else {
                addLog('Queue is empty.');
            }

            if (foundPartner) {
                // 2. Found someone! Remove them from queue and call them
                addLog(`Found partner: ${foundPartner.peerId}`);
                addLog('Calling partner...');

                // Try to remove them to "claim" them (transaction-like)
                // Simple approach: just remove and call
                await remove(child(queueRef, foundPartner.key));

                getLocalStream().then((stream) => {
                    const call = peerRef.current.call(foundPartner.peerId, stream);
                    currentCallRef.current = call;

                    // Monitor ICE Connection State
                    call.peerConnection.oniceconnectionstatechange = () => {
                        const iceState = call.peerConnection.iceConnectionState;
                        addLog(`ICE State: ${iceState}`);
                        if (iceState === 'disconnected' || iceState === 'failed' || iceState === 'closed') {
                            setStatus('idle');
                            addLog('Connection lost (ICE)');
                            endCall();
                        }
                    };

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
                        alert('Partner ended the call');
                    });

                    call.on('error', (err) => {
                        addLog(`Call Error: ${err}`);
                        setStatus('idle');
                    });
                });

            } else {
                // 3. No one waiting. Add myself to queue.
                addLog('No match found. Waiting in queue...');
                const newRef = push(queueRef);
                myQueueRef.current = newRef;

                await set(newRef, {
                    peerId: myPeerId,
                    timestamp: Date.now()
                });
                addLog('Added to queue. Waiting...');

                // Remove from queue if I disconnect
                onDisconnect(newRef).remove();
            }
        } catch (error) {
            console.error("Firebase Error:", error);
            addLog(`Error: ${error.message}`);
            setStatus('idle');
            alert(`Connection Error: ${error.message}. Check Firebase Console -> Rules!`);
        }
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
                        <button
                            onClick={findPartner}
                            className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl font-bold text-lg shadow-lg shadow-pink-500/20 hover:shadow-pink-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            Find a Partner
                        </button>
                    )}

                    {status === 'searching' && (
                        <div className="text-center">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
                            <p className="text-gray-400 animate-pulse">Looking for someone...</p>
                            <button onClick={endCall} className="mt-4 text-xs text-red-400 hover:text-red-300 underline">Cancel Search</button>
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

            {/* Hidden Audio - Use opacity-0 instead of hidden to prevent browser optimization issues */}
            <audio ref={remoteAudioRef} autoPlay playsInline controls className="opacity-0 absolute pointer-events-none" />
        </div>
    );
};

export default App;
