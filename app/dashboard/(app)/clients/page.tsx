import Soon from '@/components/dashboard/Soon';

export default function Page() {
  return (
    <Soon
      title="Clientes"
      intro="A gestão dos clientes com quem já trabalhas."
      items={[
        'Ficha de cada cliente',
        'Trabalhos entregues',
        'Histórico de faturação',
      ]}
    />
  );
}
