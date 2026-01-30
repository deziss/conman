import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { GlassCard } from './GlassCard';
import clsx from 'clsx';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
}: ConfirmModalProps) => {
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-xl text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
                <GlassCard className="p-6 border-slate-700/50 bg-slate-900/80">
                  <div className="sm:flex sm:items-start">
                    {isDestructive && (
                      <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-500/10 sm:mx-0 sm:h-10 sm:w-10">
                        <ExclamationTriangleIcon className="h-6 w-6 text-red-500" aria-hidden="true" />
                      </div>
                    )}
                    <div className={clsx("mt-3 text-center sm:mt-0 sm:text-left", isDestructive && "sm:ml-4")}>
                      <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-slate-100">
                        {title}
                      </Dialog.Title>
                      <div className="mt-2">
                        <p className="text-sm text-slate-400">
                          {message}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-3">
                    <button
                      type="button"
                      className={clsx(
                        "inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm sm:w-auto transition-all",
                        isDestructive 
                          ? "bg-red-600 hover:bg-red-500 shadow-red-500/20" 
                          : "bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/20"
                      )}
                      onClick={() => {
                        onConfirm();
                        onClose();
                      }}
                    >
                      {confirmText}
                    </button>
                    <button
                      type="button"
                      className="mt-3 inline-flex w-full justify-center rounded-md bg-white/5 px-3 py-2 text-sm font-semibold text-slate-300 shadow-sm ring-1 ring-inset ring-white/10 hover:bg-white/10 sm:mt-0 sm:w-auto transition-all"
                      onClick={onClose}
                    >
                      {cancelText}
                    </button>
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
