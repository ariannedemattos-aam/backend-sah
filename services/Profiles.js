const shared = 'dashboard.read';
export const profilePermissions = {
  userAdmin: ['users.manage', 'sectors.manage', shared, 'surveys.read', 'feedback.read', 'reports.export',
    'questions.read', 'questions.create', 'questions.update', 'questions.approve', 'questions.reject',
    'invitations.manage', 'tvwall.read', 'return_requests.manage', 'ombudsman.manage', 'roster.read', 'roster.write'],
  userSetor: ['questions.read', 'questions.propose', 'feedback.read', 'roster.read', 'roster.write'],
  gestao: [shared,'surveys.read','feedback.read','reports.export','roster.read','roster.write'],
  ouvidoria: ['ombudsman.manage','return_requests.manage'],
  visualizador: [shared],
};

export const lowScoreMax = 6;
