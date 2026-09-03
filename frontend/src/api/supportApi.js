import ApiUtils from '../../api/apiUtils';

export async function listSupportTickets() {
  const { data } = await ApiUtils.get('/support/tickets');
  return data;
}

export async function getSupportTicket(id) {
  const { data } = await ApiUtils.get(`/support/tickets/${id}`);
  return data;
}

export async function createSupportTicket(payload) {
  const { data } = await ApiUtils.post('/support/tickets', payload);
  return data;
}

export async function addSupportComment(ticketId, body) {
  const { data } = await ApiUtils.post(`/support/tickets/${ticketId}/comments`, { body });
  return data;
}
