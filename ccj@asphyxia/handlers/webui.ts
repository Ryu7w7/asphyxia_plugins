export const getProfiles = async (data: any, send: any) => {
  const profiles = await DB.Find<any>(null, { collection: 'profile' });
  send.json(profiles);
};

export const updateName = async (data: { refid: string; name: string }, send: any) => {
  if (!data.refid || !data.name) {
    return send.json({ status: 'error', message: 'Missing refid or name' });
  }

  try {
    const profile = await DB.FindOne<any>(data.refid, { collection: 'profile' });
    if (!profile) {
      return send.json({ status: 'error', message: 'Profile not found' });
    }

    await DB.Update<any>(
      data.refid,
      { collection: 'profile' },
      { $set: { name: data.name } } as any
    );

    send.json({ status: 'ok' });
  } catch (e) {
    send.json({ status: 'error', message: e.message });
  }
};
