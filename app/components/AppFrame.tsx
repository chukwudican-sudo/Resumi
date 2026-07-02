interface AppFrameProps {
  children: React.ReactNode;
}

export default function AppFrame({ children }: AppFrameProps) {
  return (
    <>
      <div className="flex min-h-screen items-center justify-center px-8 text-center xl:hidden">
        <p className="text-lg text-slate-300">
          Resumi is designed for laptop use. Please open on a desktop or laptop browser.
        </p>
      </div>
      <div className="hidden xl:block">{children}</div>
    </>
  );
}
