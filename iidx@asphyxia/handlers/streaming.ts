export const streamingcommon: EPR = async (info, data, send) => {
  return send.object({
    cm_info: {
      // Empty cm_info so the client doesn't try to load banners or crash.
      // If we wanted to serve TDJ banners (.ifs), we'd return a list of cm tags here.
    }
  });
};

export const streaminggetcm: EPR = async (info, data, send) => {
  // If the client requests a banner chunk, we just return nothing or error
  return send.deny();
};
