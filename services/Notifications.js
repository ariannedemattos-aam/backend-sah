import { randomUUID } from 'node:crypto';

export async function notifyUsers(connection, recipients, event) {
  const users = [...new Set(recipients)];
  if (!users.length) return users;
  const row = '(?,?,?,?,?,?)';
  await connection.execute(
    'INSERT INTO user_notifications (id,user_id,event_type,title,message,href) VALUES ' + users.map(() => row).join(','),
    users.flatMap(user => [randomUUID(), user, event.type, event.title, event.message, event.href]),
  );
  return users;
}

export async function notifyPermission(connection, permissions, event, { surveyId } = {}) {
  const choices = permissions.map(() => '?').join(',');
  const surveyScope = surveyId ? " AND (r.name<>'userSetor' OR NOT EXISTS (SELECT 1 FROM survey_attendances a WHERE a.survey_id=? "
    + 'AND NOT EXISTS (SELECT 1 FROM user_sectors us WHERE us.sector_id=a.sector_id AND us.user_id=u.id)))' : '';
  const [recipients] = await connection.execute(
    'SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.is_active=1 AND u.deleted_at IS NULL AND '
      + '(EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.name IN (' + choices + '))'
      + ' OR EXISTS (SELECT 1 FROM user_permissions up JOIN permissions p ON p.id=up.permission_id WHERE up.user_id=u.id AND p.name IN (' + choices + ')))' + surveyScope,
    [...permissions, ...permissions, ...(surveyId ? [surveyId] : [])],
  );
  return notifyUsers(connection, recipients.map(user => user.id), event);
}

export async function notifyQuestionAuthor(connection, author, approved) {
  if (!author) return [];
  const [[user]] = await connection.execute(
    'SELECT u.id,r.name role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.is_active=1 AND u.deleted_at IS NULL',
    [author],
  );
  if (!user || !['userAdmin', 'userSetor'].includes(user.role)) return [];
  return notifyUsers(connection, [user.id], {
    type: approved ? 'question.approved' : 'question.rejected',
    title: approved ? 'Pergunta aprovada' : 'Pergunta rejeitada',
    message: approved ? 'Uma de suas perguntas foi aprovada.' : 'Uma de suas perguntas foi rejeitada. Você pode revisar sua proposta.',
    href: user.role === 'userAdmin' ? '/admin/perguntas' : '/setor/perguntas',
  });
}
