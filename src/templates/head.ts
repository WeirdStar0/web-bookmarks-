export const head = `
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>我的书签</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
        }
    </script>
    <style>
        [x-cloak] { display: none !important; }
        
        /* Custom Scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        
        ::-webkit-scrollbar-thumb {
            background-color: #e5e7eb; /* gray-200 */
            border-radius: 4px;
            border: 2px solid transparent;
            background-clip: content-box;
        }
        
        ::-webkit-scrollbar-thumb:hover {
            background-color: #d1d5db; /* gray-300 */
        }
        
        /* Dark mode scrollbar */
        .dark ::-webkit-scrollbar-thumb {
            background-color: #374151; /* gray-700 */
        }
        
        .dark ::-webkit-scrollbar-thumb:hover {
            background-color: #4b5563; /* gray-600 */
        }
    </style>
</head>
`;
