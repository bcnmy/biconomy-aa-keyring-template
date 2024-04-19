export const getBundlerUrl = (chainId: number) => {
  switch (chainId) {
    case 11155111:
      return 'https://bundler.biconomy.io/api/v2/11155111/A5CBjLqSc.0dcbc53e-anPe-44c7-b22d-21071345f76a';
    case 137:
      return 'https://bundler.biconomy.io/api/v2/137/A5CBjLqSc.0dcbc53e-anPe-44c7-b22d-21071345f76a';
    case 80001:
      return 'https://bundler.biconomy.io/api/v2/80001/A5CBjLqSc.0dcbc53e-anPe-44c7-b22d-21071345f76a';
    case 80002:
      return 'https://bundler.biconomy.io/api/v2/80002/A5CBjLqSc.0dcbc53e-anPe-44c7-b22d-21071345f76a';
    default:
      throw new Error('Unsupported chainId');
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
    case 80002:
      return 'EgSfqphAf.13b943b8-8a21-45ab-bd3b-f856a7569cb3';
    default:
      throw new Error('Unsupported chainId');
  }
};

// USDC
// could be others as well until symbol mapping is added
export const getPreferredTokenAddress = (chainId: number) => {
  switch (chainId) {
    // DAI on sepolia
    case 11155111:
      return '0x77ab54631bfbae40383c62044dc30b229c7df9f5';
    case 137:
      return '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
    case 80001:
      return '0xdA5289fCAAF71d52a80A254da614a192b693e977';
    case 80002:
      return '0xf555f8d9cf90f9d95d34488e6c852796d9acbd31';
    default:
      throw new Error('Unsupported chainId');
  }
};
