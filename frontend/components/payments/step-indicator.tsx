const STEP_LABELS = ['Amount', 'Method', 'Pay'];

export function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === currentStep;
          const isComplete = stepNum < currentStep;
          return (
            <div key={label} className="flex flex-1 flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  isComplete
                    ? 'bg-blue-600 text-white'
                    : isActive
                      ? 'border-2 border-blue-600 text-blue-600'
                      : 'border-2 border-gray-300 text-gray-400'
                }`}
              >
                {isComplete ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span className={`mt-1 text-xs ${isActive ? 'font-medium text-blue-600' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex">
        <div className="flex-1 px-4">
          <div className={`h-1 rounded ${currentStep > 1 ? 'bg-blue-600' : 'bg-gray-200'}`} />
        </div>
        <div className="flex-1 px-4">
          <div className={`h-1 rounded ${currentStep > 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
        </div>
      </div>
    </div>
  );
}
