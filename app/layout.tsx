import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Agenda del despacho',description:'Reservas de salas y atención a clientes',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>;}
