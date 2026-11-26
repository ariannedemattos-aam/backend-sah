export const ok = (res, data, message = 'Operação realizada com sucesso.', status = 200) => res.status(status).json({ success: true, message, data });
export const paginated = (res, data, pagination) => res.json({ success: true, data, pagination });
