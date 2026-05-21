interface Window {
  google: {
    accounts: {
      id: {
        initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void;
        renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        prompt: () => void;
      };
    };
  };
}
