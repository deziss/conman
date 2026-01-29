import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, CodeBracketIcon } from '@heroicons/react/24/solid';
import { GlassCard } from './ui/GlassCard';

interface InspectModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: any;
}

export const InspectModal = ({ isOpen, onClose, title, data }: InspectModalProps) => {
  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto w-screen">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl h-[80vh] flex flex-col">
                <GlassCard className="h-full flex flex-col p-0">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
                        <Dialog.Title as="h3" className="text-xl font-semibold leading-6 text-slate-100 flex items-center">
                            <CodeBracketIcon className="w-5 h-5 mr-2 text-cyan-400" />
                            {title}
                        </Dialog.Title>
                        <button
                            type="button"
                            className="text-slate-400 hover:text-white transition-colors"
                            onClick={onClose}
                        >
                            <XMarkIcon className="w-6 h-6" aria-hidden="true" />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-auto p-6 bg-slate-900/50 font-mono text-xs text-slate-300">
                        <pre className="whitespace-pre-wrap break-all">
                            {JSON.stringify(data, null, 2)}
                        </pre>
                    </div>
                </GlassCard>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};
