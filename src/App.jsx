onClick = {() => remoteAudioRef.current?.play()}
className = "w-full py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
    >
    <span>🔊</span> Force Play Audio
                            </button >
                            <button
                                onClick={endCall}
                                className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                            >
                                <span>❌</span> End Call
                            </button>
                            <p className="text-xs text-center text-gray-500">Connected via PeerJS • End-to-End Encrypted</p>
                        </div >
                    )}
                </div >

            </div >

    {/* Logs (Collapsible/Small) */ }
    < div className = "mt-8 w-full max-w-lg" >
        <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/5 p-4 h-32 overflow-y-auto font-mono text-xs text-gray-400">
            {logs.length === 0 && <span className="opacity-50">System ready...</span>}
            {logs.map((log, i) => (
                <div key={i} className="mb-1 border-l-2 border-pink-500/50 pl-2">
                    <span className="text-pink-500 mr-2">›</span>
                    {log}
                </div>
            ))}
        </div>
            </div >

    {/* Hidden Audio */ }
    < audio ref = { remoteAudioRef } autoPlay playsInline controls className = "hidden" />
        </div >
    );
};

export default App;
