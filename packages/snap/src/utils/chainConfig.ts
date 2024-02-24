export const getBundlerUrl = (chainId: number) => {
  switch (chainId) {
    case 11155111:
      return 'https://bundler.biconomy.io/api/v2/11155111/A5CBjLqSc.0dcbc53e-anPe-44c7-b22d-21071345f76a';
    case 137:
      return 'https://bundler.biconomy.io/api/v2/137/A5CBjLqSc.0dcbc53e-anPe-44c7-b22d-21071345f76a';
    case 80001:
      return 'https://bundler.biconomy.io/api/v2/80001/A5CBjLqSc.0dcbc53e-anPe-44c7-b22d-21071345f76a';
    default:
      return ''; // unsupported
  }

  // possibly
  // return `https://bundler.biconomy.io/api/v2/${chainId}/A5CBjLqSc.0dcbc53e-anPe-44c7-b22d-21071345f76a`
};

export const getBiconomyPaymasterApiKey = (chainId: number) => {
  switch (chainId) {
    case 11155111:
      return 'mkwexnsPg.a968d9a7-9738-43be-9c9d-fc77ed8efd2b';
    case 137:
      return '7EWVxM54J.bf7065d2-56f8-4cf9-ae65-29f25c496e1b';
    case 80001:
      return 'EgSfqphAf.13b943b8-8a21-45ab-bd3b-f856a7569cb3';
    default:
      return ''; // unsupported
  }
};
