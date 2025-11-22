import { head } from './templates/head';
import { loading } from './templates/loading';
import { login } from './templates/login';
import { main } from './templates/main';
import { modals } from './templates/modals';
import { scripts } from './templates/scripts';

export const html = `
<!DOCTYPE html>
<html lang="zh-CN" class="light">
${head}
<body class="bg-gray-50 dark:bg-gray-900 transition-colors duration-200" x-data="app()" x-init="init()">
    ${loading}
    ${login}
    ${main}
    ${modals}
    ${scripts}
</body>
</html>
`;
