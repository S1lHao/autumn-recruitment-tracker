alter type public.application_stage add value if not exists '待测评' after '已投递';
alter type public.application_stage add value if not exists '待笔试' after '待测评';
alter type public.application_stage add value if not exists '泡池子ing' after '待笔试';
