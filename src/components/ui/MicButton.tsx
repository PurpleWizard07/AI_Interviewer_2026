interface MicButtonProps {
  isListening: boolean
  isBusy: boolean        // thinking or speaking
  isDisabled: boolean
  onClick: () => void
}

/**
 * Large mic button.
 * - Idle/ready: indigo outline, mic icon
 * - Listening: red fill, pulsing ring, stop icon
 * - Busy: muted, no interaction
 */
export function MicButton({ isListening, isBusy, isDisabled, onClick }: MicButtonProps) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Pulsing ring when listening */}
      {isListening && (
        <>
          <div className="absolute w-24 h-24 rounded-full bg-red-500/10 animate-ping" />
          <div className="absolute w-20 h-20 rounded-full bg-red-500/15 animate-pulse" />
        </>
      )}

      <button
        onClick={onClick}
        disabled={isDisabled}
        aria-label={isListening ? 'Stop recording' : 'Start speaking'}
        className={`
          relative w-16 h-16 rounded-full border-2 flex items-center justify-center
          transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500
          ${isListening
            ? 'bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/30 scale-110'
            : isBusy
            ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed scale-95 opacity-50'
            : 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500 hover:scale-105 shadow-lg shadow-indigo-500/20 cursor-pointer'
          }
        `}
      >
        {isListening ? (
          /* Stop square */
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2.5" />
          </svg>
        ) : (
          /* Mic */
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
          </svg>
        )}
      </button>
    </div>
  )
}
